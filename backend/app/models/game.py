"""
Open-Pax — Core Models
======================
Основные модели данных для игры.
"""

from dataclasses import dataclass, field
from typing import Optional, Dict, List, Any
from datetime import datetime
from enum import Enum


class RegionStatus(Enum):
    """Статус региона"""
    ACTIVE = "active"
    OCCUPIED = "occupied"
    DESTROYED = "destroyed"
    INDEPENDENT = "independent"


class BlocType(Enum):
    """Тип блока/коалиции"""
    MILITARY = "military"
    ECONOMIC = "economic"
    POLITICAL = "political"
    NEUTRAL = "neutral"


@dataclass
class MapObject:
    """Объект на карте (армия, здание и т.д.)"""
    id: str
    type: str  # "army", "factory", "university", "city"
    name: str
    x: float    # Координаты (0-100)
    y: float
    owner: Optional[str] = None
    level: int = 1
    metadata: Dict[str, Any] = field(default_factory=dict)


@dataclass
class Region:
    """Регион/государство на карте"""
    id: str
    name: str
    svg_path: str        # SVG path d attribute
    color: str           # Текущий цвет (hex)
    owner: str           # ID игрока или "neutral"
    population: int = 0
    gdp: float = 0.0
    military_power: int = 0
    objects: List[MapObject] = field(default_factory=list)
    borders: List[str] = field(default_factory=list)  # ID соседей
    status: RegionStatus = RegionStatus.ACTIVE
    metadata: Dict[str, Any] = field(default_factory=dict)


@dataclass
class Bloc:
    """Блок/коалиция стран"""
    id: str
    name: str
    type: BlocType
    members: List[str]  # ID регионов
    leader: Optional[str] = None
    color: str = "#888888"
    description: str = ""


@dataclass
class GameWorld:
    """Мир/карта в игре"""
    id: str
    name: str
    description: str
    
    # Настройки генерации
    start_date: str           # "1951-01-01"
    base_prompt: str          # Базовый промпт мира
    historical_accuracy: float # 0-1 насколько исторично
    
    # Состояние
    regions: Dict[str, Region] = field(default_factory=dict)
    blocs: Dict[str, Bloc] = field(default_factory=dict)
    
    # Мета
    created_at: datetime = field(default_factory=datetime.now)
    updated_at: datetime = field(default_factory=datetime.now)
    version: int = 1


@dataclass
class Player:
    """Игрок"""
    id: str
    name: str
    region_id: str           # Какую страну контролирует
    color: str               # Цвет игрока на карте


@dataclass
class Action:
    """Действие игрока"""
    id: str
    player_id: str
    turn: int
    text: str                # Описание действия текстом
    resources: Dict[str, Any] = field(default_factory=dict)  # Потраченные ресурсы
    created_at: datetime = field(default_factory=datetime.now)


@dataclass
class TurnResult:
    """Результат хода"""
    turn: int
    world_state: Dict[str, Any]  # Изменения в мире
    events: List[str]            # Произошедшие события
    changes: Dict[str, Any]      # Изменения региона игрока
    narration: str               # Описание от лица мира
    advisor_tips: List[str]      # Советы от советника
    
    # Мета
    llm_calls: int = 1
    tokens_used: int = 0
    duration_ms: int = 0


@dataclass
class Game:
    """Текущая игра"""
    id: str
    world: GameWorld
    players: List[Player]
    current_turn: int = 1
    max_turns: int = 100
    
    # История
    actions: List[Action] = field(default_factory=list)
    results: List[TurnResult] = field(default_factory=list)
    
    # Настройки
    speed: str = "normal"  # "slow", "normal", "fast"
    difficulty: str = "normal"
    
    # Статус
    status: str = "waiting"  # "waiting", "playing", "finished"
    created_at: datetime = field(default_factory=datetime.now)
    updated_at: datetime = field(default_factory=datetime.now)


# ============================================================================
# Type Guards
# ============================================================================

def validate_world(world: GameWorld) -> bool:
    """Валидация мира"""
    if not world.regions:
        return False
    if not world.start_date:
        return False
    return True


def get_region_neighbors(world: GameWorld, region_id: str) -> List[Region]:
    """Получить соседей региона"""
    region = world.regions.get(region_id)
    if not region:
        return []
    return [world.regions[nid] for nid in region.borders if nid in world.regions]


def calculate_bloc_power(world: GameWorld, bloc_id: str) -> int:
    """Подсчитать силу блока"""
    bloc = world.blocs.get(bloc_id)
    if not bloc:
        return 0
    return sum(world.regions[r].military_power for r in bloc.members if r in world.regions)
