"""
Open-Pax — LLM Agents
=====================
Агенты для управления игровым миром.
"""

import os
import json
import asyncio
from abc import ABC, abstractmethod
from typing import Dict, List, Any, Optional
from datetime import datetime

import requests


class LLMProvider(ABC):
    """Базовый класс для LLM провайдера"""
    
    @abstractmethod
    async def generate(self, system: str, user: str, **kwargs) -> str:
        """Сгенерировать ответ"""
        pass


class MiniMaxProvider(LLMProvider):
    """MiniMax API провайдер"""
    
    def __init__(self, api_key: str = None, base_url: str = "https://api.minimax.io/v1"):
        self.api_key = api_key or os.getenv("MINIMAX_API_KEY")
        self.base_url = base_url
    
    async def generate(self, system: str, user: str, **kwargs) -> str:
        """Вызов MiniMax API"""
        url = f"{self.base_url}/text/chatcompletion_v2"
        
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json"
        }
        
        payload = {
            "model": kwargs.get("model", "MiniMax-M2.5"),
            "messages": [
                {"role": "system", "content": system},
                {"role": "user", "content": user}
            ],
            "temperature": kwargs.get("temperature", 0.7),
            "max_tokens": kwargs.get("max_tokens", 4096)
        }
        
        response = requests.post(url, headers=headers, json=payload, timeout=60)
        response.raise_for_status()
        
        data = response.json()
        return data["choices"][0]["message"]["content"]


class BaseAgent(ABC):
    """Базовый класс для игрового агента"""
    
    def __init__(self, name: str, provider: LLMProvider, system_prompt: str = ""):
        self.name = name
        self.provider = provider
        self.system_prompt = system_prompt
        self.conversation_history: List[Dict] = []
    
    async def think(self, context: Dict[str, Any], user_input: str) -> str:
        """Основной метод — агент думает"""
        prompt = self._build_prompt(context, user_input)
        response = await self.provider.generate(
            system=self.system_prompt,
            user=prompt,
            temperature=self.temperature()
        )
        
        # Сохраняем в историю
        self.conversation_history.append({
            "role": "user",
            "content": user_input
        })
        self.conversation_history.append({
            "role": "assistant", 
            "content": response
        })
        
        return response
    
    @abstractmethod
    def _build_prompt(self, context: Dict[str, Any], user_input: str) -> str:
        """Построить промпт из контекста"""
        pass
    
    @abstractmethod
    def temperature(self) -> float:
        """Температура для генерации"""
        pass
    
    def reset(self):
        """Сбросить историю"""
        self.conversation_history = []


class CountryAgent(BaseAgent):
    """Агент, управляющий конкретной страной"""
    
    def __init__(self, provider: LLMProvider, region_id: str, region_name: str):
        super().__init__(
            name=f"country_{region_id}",
            provider=provider,
            system_prompt=self._get_system_prompt()
        )
        self.region_id = region_id
        self.region_name = region_name
    
    def _get_system_prompt(self) -> str:
        return """Ты — руководитель страны в альтернативной истории.
Твоя задача — анализировать действия игрока и предлагать реакцию страны.

Правила:
1. Действуй логично и рационально
2. Учитывай экономические и военные ресурсы
3. Реагируй на действия других стран
4. Описывай события в историческом стиле

Отвечай кратко и по делу."""
    
    def _build_prompt(self, context: Dict[str, Any], user_input: str) -> str:
        return f"""Страна: {self.region_name}
Текущее состояние:
{json.dumps(context.get('state', {}), indent=2, ensure_ascii=False)}

Действие игрока:
{user_input}

Опиши реакцию страны на это действие."""
    
    def temperature(self) -> float:
        return 0.7


class WorldAgent(BaseAgent):
    """Агент, управляющий глобальным миром"""
    
    def __init__(self, provider: LLMProvider, world_prompt: str):
        super().__init__(
            name="world",
            provider=provider,
            system_prompt=self._get_system_prompt()
        )
        self.world_prompt = world_prompt
    
    def _get_system_prompt(self) -> str:
        return """Ты — Мир в альтернативной истории.
Твоя задача — следить за глобальным балансом сил и генерировать исторические события.

Правила:
1. Соблюдай логику исторического развития
2. Учитывай действия всех стран
3. Генерируй интересные события
4. Поддерживай консистентность мира

Будешь описывать события как исторический нарратив."""
    
    def _build_prompt(self, context: Dict[str, Any], user_input: str) -> str:
        return f"""Мир: {self.world_prompt}

Глобальное состояние:
{json.dumps(context.get('global_state', {}), indent=2, ensure_ascii=False)}

Ход номер: {context.get('turn', 1)}

События этого хода:
{json.dumps(context.get('events', []), indent=2, ensure_ascii=False)}

Опиши как мир отреагировал на эти события."""
    
    def temperature(self) -> float:
        return 0.8


class AdvisorAgent(BaseAgent):
    """Агент-советник, предлагает действия игроку"""
    
    def __init__(self, provider: LLMProvider):
        super().__init__(
            name="advisor",
            provider=provider,
            system_prompt=self._get_system_prompt()
        )
    
    def _get_system_prompt(self) -> str:
        return """Ты — Интерактивный Советник игрока.
Твоя задача — анализировать ситуацию и предлагать 3-5 конкретных действий.

Правила:
1. Предлагай только реалистичные действия
2. Учитывай текущие ресурсы игрока
3. Действия должны быть разнообразными
4. Кратко и по делу

Формат ответа:
- Предложение 1: ...
- Предложение 2: ..."""
    
    def _build_prompt(self, context: Dict[str, Any], user_input: str) -> str:
        return f"""Ситуация игрока:
{json.dumps(context.get('player_state', {}), indent=2, ensure_ascii=False)}

Мир вокруг:
{json.dumps(context.get('world_state', {}), indent=2, ensure_ascii=False)}

Что происходит:
{user_input}

Предложи 3-5 действий на следующий ход."""
    
    def temperature(self) -> float:
        return 0.9


class GameController:
    """Контроллер игры — координирует всех агентов"""
    
    def __init__(self, provider: LLMProvider):
        self.provider = provider
        self.world_agent: Optional[WorldAgent] = None
        self.advisor_agent = AdvisorAgent(provider)
        self.country_agents: Dict[str, CountryAgent] = {}
    
    def setup_world(self, world_prompt: str):
        """Настроить мир"""
        self.world_agent = WorldAgent(self.provider, world_prompt)
    
    def add_country(self, region_id: str, region_name: str):
        """Добавить страну"""
        self.country_agents[region_id] = CountryAgent(
            self.provider, region_id, region_name
        )
    
    async def process_turn(
        self,
        player_region_id: str,
        player_action: str,
        game_context: Dict[str, Any]
    ) -> Dict[str, Any]:
        """Обработать ход игрока"""
        
        # 1. Обработать действие игрока (страна)
        country_agent = self.country_agents.get(player_region_id)
        if not country_agent:
            raise ValueError(f"Country agent not found: {player_region_id}")
        
        country_response = await country_agent.think(
            game_context,
            player_action
        )
        
        # 2. Обработать действие (мир)
        world_context = {
            **game_context,
            "events": [{"type": "player_action", "content": player_action}]
        }
        
        world_response = await self.world_agent.think(
            world_context,
            f"Реакция страны {country_agent.region_name}: {country_response}"
        )
        
        # 3. Вернуть результат
        return {
            "country_response": country_response,
            "world_response": world_response,
            "turn": game_context.get("turn", 1)
        }
    
    async def get_advisor_tips(self, game_context: Dict[str, Any]) -> List[str]:
        """Получить советы от советника"""
        response = await self.advisor_agent.think(
            game_context,
            "Проанализируй текущую ситуацию и предложи действия."
        )
        
        # Парсим советы
        tips = []
        for line in response.split('\n'):
            if line.strip() and (line[0].isdigit() or line.startswith('-')):
                tips.append(line.strip())
        
        return tips[:5]  # Максимум 5 советов
