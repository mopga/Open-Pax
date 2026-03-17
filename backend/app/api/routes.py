"""
Open-Pax — API Routes
====================
REST API для игры.
"""

from fastapi import FastAPI, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Dict, List, Optional, Any
import uuid
from datetime import datetime

from app.models.game import (
    Game, GameWorld, Region, Bloc, Player, 
    Action, TurnResult, MapObject, BlocType, RegionStatus
)
from app.agents.base import MiniMaxProvider, GameController


app = FastAPI(title="Open-Pax API", version="0.1.0")

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Инициализация
llm_provider = MiniMaxProvider()
game_controller = GameController(llm_provider)

# In-memory storage (в продакшене — PostgreSQL)
games: Dict[str, Game] = {}
worlds: Dict[str, GameWorld] = {}


# ============================================================================
# Pydantic Models
# ============================================================================

class WorldCreate(BaseModel):
    name: str
    description: str
    start_date: str
    base_prompt: str
    historical_accuracy: float = 0.8


class RegionCreate(BaseModel):
    id: str
    name: str
    svg_path: str
    color: str = "#888888"


class GameCreate(BaseModel):
    world_id: str
    player_name: str
    player_region_id: str


class ActionSubmit(BaseModel):
    game_id: str
    player_id: str
    text: str


class AdvisorRequest(BaseModel):
    game_id: str
    player_id: str


# ============================================================================
# World Endpoints
# ============================================================================

@app.post("/worlds", response_model=Dict)
async def create_world(world: WorldCreate):
    """Создать новый мир"""
    world_id = str(uuid.uuid4())[:8]
    
    new_world = GameWorld(
        id=world_id,
        name=world.name,
        description=world.description,
        start_date=world.start_date,
        base_prompt=world.base_prompt,
        historical_accuracy=world.historical_accuracy
    )
    
    worlds[world_id] = new_world
    
    # Настроить агента мира
    game_controller.setup_world(world.base_prompt)
    
    return {"id": world_id, "name": world.name}


@app.get("/worlds/{world_id}")
async def get_world(world_id: str):
    """Получить мир"""
    if world_id not in worlds:
        raise HTTPException(status_code=404, detail="World not found")
    return worlds[world_id]


@app.post("/worlds/{world_id}/regions")
async def add_region(world_id: str, region: RegionCreate):
    """Добавить регион на карту"""
    if world_id not in worlds:
        raise HTTPException(status_code=404, detail="World not found")
    
    new_region = Region(
        id=region.id,
        name=region.name,
        svg_path=region.svg_path,
        color=region.color,
        owner="neutral"
    )
    
    worlds[world_id].regions[region.id] = new_region
    return {"id": region.id, "name": region.name}


# ============================================================================
# Game Endpoints  
# ============================================================================

@app.post("/games", response_model=Dict)
async def create_game(game: GameCreate):
    """Начать новую игру"""
    
    # Проверить мир
    if game.world_id not in worlds:
        raise HTTPException(status_code=404, detail="World not found")
    
    world = worlds[game.world_id]
    
    # Проверить регион
    if game.player_region_id not in world.regions:
        raise HTTPException(status_code=404, detail="Region not found")
    
    # Создать игрока
    player_id = str(uuid.uuid4())[:8]
    player = Player(
        id=player_id,
        name=game.player_name,
        region_id=game.player_region_id,
        color="#FF0000"
    )
    
    # Создать игру
    game_id = str(uuid.uuid4())[:8]
    new_game = Game(
        id=game_id,
        world=world,
        players=[player],
        status="playing"
    )
    
    games[game_id] = new_game
    
    # Зарегистрировать страну в контроллере
    region = world.regions[game.player_region_id]
    game_controller.add_country(game.player_region_id, region.name)
    
    return {
        "game_id": game_id,
        "player_id": player_id,
        "region": {"id": region.id, "name": region.name}
    }


@app.get("/games/{game_id}")
async def get_game(game_id: str):
    """Получить состояние игры"""
    if game_id not in games:
        raise HTTPException(status_code=404, detail="Game not found")
    
    game = games[game_id]
    
    return {
        "id": game.id,
        "turn": game.current_turn,
        "status": game.status,
        "world": {
            "name": game.world.name,
            "regions": [
                {
                    "id": r.id,
                    "name": r.name,
                    "color": r.color,
                    "owner": r.owner,
                    "population": r.population,
                    "military_power": r.military_power
                }
                for r in game.world.regions.values()
            ],
            "blocs": [
                {
                    "id": b.id,
                    "name": b.name,
                    "members": b.members,
                    "color": b.color
                }
                for b in game.world.blocs.values()
            ]
        },
        "player": {
            "id": game.players[0].id,
            "region_id": game.players[0].region_id
        }
    }


@app.post("/games/{game_id}/action")
async def submit_action(action: ActionSubmit):
    """Отправить действие игрока"""
    
    if action.game_id not in games:
        raise HTTPException(status_code=404, detail="Game not found")
    
    game = games[action.game_id]
    
    # Подготовить контекст
    player = game.players[0]
    region = game.world.regions[player.region_id]
    
    game_context = {
        "turn": game.current_turn,
        "state": {
            "region": {
                "name": region.name,
                "population": region.population,
                "gdp": region.gdp,
                "military_power": region.military_power
            },
            "world": {
                "regions_count": len(game.world.regions),
                "blocs_count": len(game.world.blocs)
            }
        }
    }
    
    # Обработать ход
    result = await game_controller.process_turn(
        player_region_id=player.region_id,
        player_action=action.text,
        game_context=game_context
    )
    
    # Сохранить действие
    game_action = Action(
        id=str(uuid.uuid4())[:8],
        player_id=player.id,
        turn=game.current_turn,
        text=action.text
    )
    game.actions.append(game_action)
    
    # Сохранить результат
    turn_result = TurnResult(
        turn=game.current_turn,
        world_state={},
        events=[],
        changes={},
        narration=result.get("world_response", "")
    )
    game.results.append(turn_result)
    
    # Следующий ход
    game.current_turn += 1
    
    return {
        "turn": game.current_turn - 1,
        "narration": result.get("world_response", ""),
        "country_response": result.get("country_response", "")
    }


@app.get("/games/{game_id}/advisor")
async def get_advisor_tips(game_id: str, player_id: str):
    """Получить советы от советника"""
    
    if game_id not in games:
        raise HTTPException(status_code=404, detail="Game not found")
    
    game = games[game_id]
    player = next((p for p in game.players if p.id == player_id), None)
    
    if not player:
        raise HTTPException(status_code=404, detail="Player not found")
    
    region = game.world.regions[player.region_id]
    
    game_context = {
        "turn": game.current_turn,
        "player_state": {
            "region": region.name,
            "population": region.population,
            "gdp": region.gdp,
            "military_power": region.military_power
        },
        "world_state": {
            "total_regions": len(game.world.regions),
            "total_players": len(game.players)
        }
    }
    
    tips = await game_controller.get_advisor_tips(game_context)
    
    return {"tips": tips}


# ============================================================================
# Health
# ============================================================================

@app.get("/health")
async def health():
    return {"status": "ok", "timestamp": datetime.now().isoformat()}
