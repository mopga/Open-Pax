# Pax Historia preset editor — frames f_039 to f_076

Source: screen recording frames `f_039.jpg` … `f_076.jpg` (all 38 read; small text verified with 2x crops).

## Overview

The whole range takes place in the **preset editor page** (the top nav tab "Пресеты" is active). The page is one long, vertically scrolling list of collapsible sections. In this range the recording shows:

- the end of the "Правила симуляции" textarea;
- the "Карта регионов" embedded map editor, where the user hovers every toolbar button, so all tooltips are captured;
- the sections Вступительные слайды, Государства, Рекомендуемые государства, Начальные чаты, Элементы карты, Подсказки ИИ, Расширенные настройки and Похожие сценарии;
- two prompt-editor modals: "Чат с пользователем" and "Чат с советником". Their full prompt templates are transcribed below.

No gameplay appears in this range.

---

## 1. Per-frame log

- **f_039:** The page shows the bottom of the Simulation Rules textarea, then the "Карта регионов ⌄" heading and the map editor. The user hovers the toolbar tool "Рисовать…".
  - Tooltip: "Рисовать/Вырезать — нарисуйте регион; режим «Вырезать» вырезает существующие регионы".
  - Toast at bottom-left: "Сохранено" (clipped as "охранено").
  - Bottom-right section indicator: "Правила симуляции".
- **f_040:** Hover "Изменить". Tooltip: "Изменить форму — тащите вершины любого региона; тащите границу, чтобы добавить вершину; Alt+клик удаляет".
- **f_041:** Hover "Статичный". Tooltip: "Разместить фиксированный элемент карты". Group captions visible: "ОСНОВНЫЕ ИНСТРУМЕНТЫ", "ИЗМЕРЕНИЯ", "ПРОЧЕЕ".
- **f_042:** Hover "Мобильн…". Tooltip: "Разместить элемент, который перемещается вместе с регионом".
- **f_043:** Hover "Портал" (greyed out / disabled). Tooltip: "Сначала создайте другое измерение".
- **f_044, f_045:** Hover "Измерение". Tooltip: "Просматривать и редактировать измерения карты". Caption "ОБЪЕКТЫ" visible.
- **f_046:** Hover the second "Изменить" (in the ИЗМЕРЕНИЯ group). Tooltip: "Изменить это измерение — название, значок и настройки мира".
- **f_047:** Hover "Отменить". Tooltip: "Отменить последнее изменение геометрии (Ctrl+Z)".
- **f_048:** Hover "Топология", which sits next to the "›" scroll arrow. Tooltip: "Устранить проблемы топологии — найти и исправить промежутки и перекрытия".
- **f_049:** The toolbar has been scrolled horizontally to the right, and a "‹" arrow now appears at the left. New groups are revealed:
  - "РАСШИРЕННЫЙ" with the button "Расшире…" (wrench icon);
  - "СОХРАНИТЬ" with the green button "✓ Сохранено", where the cursor is.
- **f_050:** Hover the expand icon at the far right of the toolbar. Tooltip (in English): "Fullscreen editor".
- **f_051:** The page is scrolled down. The toolbar is sticky at the top of the viewport while the map scrolls under it.
  - Map hover tooltip at top center: "Great Lakes | Без владельца" (region name | owner).
  - Map controls at bottom-left: 🔍, layers, ⚙, −, +.
  - The bottom-right indicator changes to "Карта регионов".
- **f_052:** Scrolled further. Visible: the bottom of the map, then "Вступительные слайды ›" (collapsed), then "Государства ⌄" with its grid.
- **f_053:** More scrolling. The "Больше государств" button and the "Рекомендуемые государства" heading appear.
- **f_054:** The user clicks "Вступительные слайды" and it starts expanding (mid-animation). The description and empty state appear.
- **f_055:** Вступительные слайды is fully expanded, with the "+ Добавить слайд" button visible.
- **f_056:** Вступительные слайды is collapsed again. The Рекомендуемые empty state is visible.
- **f_057, f_058:** Scrolling.
- **f_059:** Рекомендуемые государства, "Начальные чаты" and the "Элементы карты" heading are visible. Indicator: "Государства".
- **f_060:** Hover "+ Добавить рекомендацию".
- **f_061:** Slight scroll.
- **f_062:** The Элементы карты grid is visible. Indicator: "Рекомендуемые государства".
- **f_063:** The "Подсказки ИИ" tile grid appears. Indicator: "Начальные чаты".
- **f_064:** "Расширенные настройки" and the "Похожие сценарии" heading are visible. Indicator: "Элементы карты".
- **f_065:** Hover on the "Подсказки ИИ" heading. The Похожие сценарии thumbnails are visible.
- **f_066:** Hover the "Чат с пользователем" tile. Tooltip: "Настроить поведение ИИ-чата при ответах пользователю".
- **f_067:** Clicking the tile opens a full-screen modal "Редактировать промпт" › "Чат с пользователем", on the "Редактировать" tab.
  - It shows a shorter template that looks older or alternative ("Version A", transcribed below), with a different helper list.
  - This looks like a transient or loading state.
- **f_068:** Same modal, but the template is replaced by a longer one ("Version B", which starts "We are making a turn-based strategy game, and the player is currently undergoing diplomacy…"). The sidebar's helper-function list also changes to match the variables used in it.
- **f_069:** The modal is scrolled down. The whole modal scrolls, sidebar included. At the end of the helper list is a red button "Удалить все (3) неиспользуемые функции" (count read as 3, possibly 2 (?)).
- **f_070:** Scrolled to the end of the template. Below the editor is a purple bar with the placeholder "Ассистент конвейера". The red button reads "(2)" here (?).
- **f_071, f_072:** Scrolled back to the top (same content as f_068). The cursor moves to the top-right.
- **f_073:** The modal is closed, and the page is back at Подсказки ИИ.
- **f_074:** Hover the "Чат с советником" tile.
- **f_075:** The modal "Редактировать промпт" › "Чат с советником" opens (pink dot), on the "Редактировать" tab, with the template shown.
- **f_076:** Scrolled to the end of the advisor template. The sidebar shows the rest of the helpers, followed by a red "Удалить все (3) неиспользуемые функции".

---

## 2. Screens and navigation

### Global top bar (black, fixed)

- **Left:** logo icon and the wordmark "Pax Historia" in a bold display font.
- **Center tabs with icons:**
  - "Игры" (gamepad);
  - "Пресеты" (play-triangle icon). Its active state is a purple pill with purple text;
  - "Ассеты" (people/shapes icon);
  - "Сообщество" (people icon).
- **Right:**
  - a small square icon button, purple-tinted, that looks like a gift or a calendar;
  - a coin balance pill "$3.264" with a gold coin icon;
  - a bell icon;
  - a round blue avatar "M".

### Page chrome

- **Bottom-left toast:** a dark grey pill "Сохранено", partly off-screen. It appears to be an autosave indicator.
- **Bottom-right scroll-spy link:** a floating underlined link with a small arrow that names the current or nearest section. Values seen: "Правила симуляции", "Карта регионов", "Государства", "Рекомендуемые государства", "Начальные чаты", "Элементы карты".
- **Layout:** the content column is about 655px wide and centered on a pure black background.
- **Section headings:** large, bold and white, followed by a chevron (⌄ when expanded, › when collapsed). Clicking a heading toggles its section.

### Section order in the preset editor (from Правила симуляции downward)

1. Правила симуляции — only its tail is visible here, as a textarea.
2. Карта регионов ⌄ — embedded map editor.
3. Вступительные слайды ›
4. Государства ⌄
5. Рекомендуемые государства ⌄
6. Начальные чаты ⌄
7. Элементы карты ⌄
8. Подсказки ИИ ⌄
9. Расширенные настройки ⌄
10. Похожие сценарии ⌄

### Modal "Редактировать промпт"

- **Frame:** full viewport, dark. In the recording it is clipped at the left edge, so the first letters of the titles are cut off.
- **Header:** "Редактировать промпт". Below it is a colored dot followed by the prompt name in large bold text:
  - "Чат с пользователем" (white/grey dot);
  - "Чат с советником" (pink dot).
- **Tabs:** "Источник промпта" | "Редактировать" (active: blue text with a blue underline) | "Тестировать" | "Оценить".
- **Left sidebar "Вспомогательные функции шаблонов":**
  - Sub-tabs:
    - "Новая функц…" — active, blue-tinted; probably "Новая функция";
    - "Магазин";
    - "…мпортировать" — probably "Импортировать".
  - A search field "Поиск функций…".
  - A list of cards. Each card shows an UPPERCASE_SNAKE function name in bold and a two-line grey English description.
  - At the end of the list, a red/pink button "Удалить все (N) неиспользуемые функции".
- **Main area:**
  - Breadcrumb/stepper: "Шаблон › Структура вывода › Модель ИИ › Очистка" (Template › Output structure › AI model › Cleanup). "Шаблон" appears active (white). This looks like a prompt pipeline: template, then output schema, then model choice, then post-processing.
  - Label "Функция шаблона".
  - A monospace code editor on a grey background. The template is a JS function body, `return \`` … `\`;`, that uses `${VAR}` interpolation and JS expressions such as `${isBeta ? A : B}`.
  - Below the editor, a dark-purple input bar with the placeholder "Ассистент конвейера" (pipeline assistant).
- **Footer:** "Закрыть" (blue link, bottom-left) and "Сохранить промпт" (green button, bottom-right).

---

## 3. Preset editor structure (sections visible in this range)

### Правила симуляции (tail of the textarea)

A dark rounded box with a light border. The visible lines, verbatim:

```
- Напряженность времен холодной войны должна сохраняться до тех пор, пока не будет  преодолена тем или иным образом.
- Страны должны предпринимать реальные инициативы в историческом стиле, или, если игрок сам способствует новым инициативам
- Не допускать застоя и задвоения событий никогда
- Поддерживать причинно-следственную связь.
- Сохранять реализм всегда насколько возможно
- НЕ МЕНЯТЬ ГРАНИЦЫ СТРАН БЕЗ ПОДХОДЯЩИХ СОБЫТИЙ
```

This field feeds `${HISTORICAL_PRESET_SIMULATION_RULES}`. The helper's description reads "Depending on the preset, show the text written in the 'Preset Specific Behavior…'".

### Вступительные слайды (collapsible, collapsed by default)

- **Description:** "До 10 слайдов, показываемых игрокам при первом открытии этого пресета. **ИИ никогда не использует это содержимое для управления игрой**. Используйте их, чтобы дать игрокам важный начальный контекст, цели, инструкции и т. д." The middle sentence is bold on screen.
- **Empty state** (dashed box): "Пока нет вступительных слайдов. Добавьте один, чтобы поприветствовать игроков перед началом игры."
- **Button:** "+ Добавить слайд" (dark blue pill).

### Государства

- **Create button:** primary blue "Создать новое государство", top right.
- **Search:** input "Поиск государств…".
- **Sort chips** (on the right):
  - "А-Я ⌃" — active, blue fill; the arrow toggles ascending/descending;
  - "Регионы" — outlined;
  - "Элементы" — outlined.
- **Grid:** dark rounded cards, six per row. Each card shows a small flag image, the country name (bold, in English) and "N регионов" in grey.
- **Visible cards** (name — region count):

  | Country | Regions |
  |---|---|
  | Afghanistan | 1 |
  | Albania | 1 |
  | Andorra | 0 |
  | Argentina | 1 |
  | Australia | 2 |
  | Belgian Congo | 3 |
  | Belgium | 4 |
  | Bhutan | 1 |
  | Bolivia | 1 |
  | Brazil | 1 |
  | British Occupied … (truncated) | 3 |
  | Brunei | 2 |
  | Bulgaria | 2 |
  | Canada | 10 |
  | Ceylon | 1 |
  | Chile | 1 |
  | Colombia | 1 |
  | Communist China | 37 |

- **Expand:** after three rows comes a "⌄ Больше государств" button.
- **Pluralization:** the label is always "регионов", even for 1 (no plural forms).

### Рекомендуемые государства

- **Button:** "+ Добавить рекомендацию" (blue).
- **Empty state** (dashed box, crown icon in a grey circle):
  - "Рекомендуемых государств пока нет"
  - "Добавьте рекомендуемые государства, чтобы помочь игрокам выбрать интересную стартовую нацию при игре в этот пресет."
  - Button: "+ Добавить первую рекомендацию".

### Начальные чаты

- **Button:** "+ Добавить чат" (blue).
- **Description:** "Беседы, добавляемые в каждую новую игру с самого начала."
- **Empty state** (dashed box, chat-bubble icon): "Пока нет начальных чатов".

### Элементы карты (map features: cities and markers)

- **Add button:** "+ Add Map Feature" — left in English, not translated.
- **Search:** "Поиск элементов карт", next to a "Фильтры" button (sliders icon).
- **Sort chips:** "А-Я ⌃" (active), "Владелец", "Форма".
- **Grid:** six cards per row. Each card shows an icon, a name and a grey subtitle "Динамический (<Owner>…)" (truncated).
- **Icons:** usually a small colored square in the owner's map color. Two exceptions: Addis Ababa has a gold ★ star (probably a capital) and Algiers has a blue ◆ diamond.
- **Visible items** (owner as shown in the subtitle):
  - Aalborg (Den…), Aberdeen (Unit…), Aberystwyth (Unit…), Abidjan (Fren…), Abu Dhabi (Unit…), Accra (Unit…)
  - Adana (Turk…), Addis Ababa ★ (Ethi…), Adelaide (Aust…), Aden (Ye…), Agadir (Fren…), Agrinio (Gre…)
  - Aguascalientes (Mexi…), Akmolinsk (Sovi…), Aleppo (Syri…), Alexandretta (Turk…), Alexandria (Egy…), Algiers ◆ (Fren…)
- **Expand:** "⌄ Больше элементов карты".
- **Note:** "Динамический" matches the map tool "Мобильный" (a feature that moves with its region), as opposed to "Статичный" (fixed).

### Подсказки ИИ (AI prompts)

A 4×3 grid of large dark tiles. Each tile has an emoji-style icon and a bold label. Clicking a tile opens the "Редактировать промпт" modal.

| Row | Tile 1 | Tile 2 | Tile 3 | Tile 4 |
|---|---|---|---|---|
| 1 | "Чат с пользователем" (white speech bubble; tooltip "Настроить поведение ИИ-чата при ответах пользователю") | "Чат с советником" (pink brain) | "Скачок вперёд" (calendar) | "Автоматический скачок вперёд" (blue ⏭) |
| 2 | "Действия" (lightning) | "Следующий говорящий" (microphone) | "Описание в действие" (sparkles) | "Объединитель событий" (document) |
| 3 | "Создание катализатора" (flame) | "Исполнитель катализатора" (gear) | "Обобщитель катализатора" (memo with pencil) | "Мастер игры" (dice) |

### Расширенные настройки

Three tiles:
- "Настройки консолидации событий" (document icon);
- "Параметры отображения карты" (map icon);
- "Размер документа" (bar-chart icon).

### Похожие сценарии

A horizontal row of cover thumbnails:
- "1980 ПРЕСЕТНА…" — black-and-white tank photo;
- "RUSSIA [TRUE] COLLAPSE 2027" — Kremlin, red text;
- "РАСШИРЕННАЯ ВЕРСИЯ / РУССКИЙ …" — aircraft image.

---

## 4. Prompt templates (verbatim)

### A) "Чат с пользователем", Version B (final content, f_068 to f_070)

```
return `
We are making a turn-based strategy game, and the player is currently undergoing diplomacy with other polities. Polities are the entities that interact with the gamestate's universe. They could be civilizations, empires, countries, warlords, or even peoples, and they take actions, such as diplomacy, within the game. We need you to simulate this diplomacy, by roleplaying as one of the polities that is speaking in this chat. The player who is playing as ${PLAYER_POLITY}. The chat is ongoing, and there is a certain list of polities that are participants who can see and respond to other messages in this chat. You must respond *in-character* as a representation of one of those polities, which I will inform you of later. Your job will be to analyze the message(s) sent in this chat so far and then send a message based on the interests of your polity.

[Instructions]
The first things you must know about are the "World Before Round One" and "Simulation Rules" fields. These explain the lore in specific presets which are alt-history or non-historical universes, they might also include pre-written events that the game's creator would want to happen a specific way in rounds after the game began. The "Simulation Rules" may also determine how the in-game behavior of specific polities might be. So analyze and then keep these in mind.
World Context Before Round One: ${WORLD_BEFORE_ROUND_ONE_TEXT}
Simulation Rules: ${HISTORICAL_PRESET_SIMULATION_RULES}
You are speaking as a polity that wants to present itself. Most likely, you shouldn't entertain complete nonsense, nor speak as if you are a casual entertainer, but there are exceptions. However, you should NEVER speak in an overly dramatic way, get to the point. You should be open-minded and receptive to propositions and offers and demands made by separate polities, but again this depends on the context. Do NOT drag on a conversation with no clear direction or intention in mind. Move towards a definitive answer or goal that your polity would logically have. You should always analyze and consider propositions and deals made by the player, because the game is meant to be actually fun and versatile. However, if the player polity of ${PLAYER_POLITY} is an enemy of the polity that you are representing, then you logically shouldn't be open to collaboration unless the player, or their allies, offers something reasonable and incentivizing in their diplomacy. Part of the game's immersiveness is for polities to mention the history of the game's specific timeline, so keep that in mind.

[Difficulty]
Here is a passage about the difficulty of the game: ${DIFFICULTY_DESCRIPTION_CHATS}
The difficulty determines how much extra in-game influence/preparation, or diplomatic overtures during chats, are required to cause the SPEAKING POLITY, which remember you are simulating, to accept the propositions or requests of the player, or other polities in the chat.
Do not let that confuse you, basically the game has diplomacy, and there's a difficulty setting. So the harder the difficulty, the more effort or more influence the player must have to get diplomatic requests to succeed. Same logic for easy difficulty, if the game has an easier difficulty, let the player receive things more easily.

[Output Rules]
THIS IS VERY IMPORTANT, ensure that the length of your polity's spoken message is ALWAYS just about 2-3 sentences longer than the *length* of the *average* of all the player's messages in this specific chat. If the player begins the chat with, say, 75 characters worth of text, your output should be about 95-105 characters because they have only sent one message, and therefore the average of their message lengths is 75 characters. Then continue to change your output length depending on what their total average ends up being in this specific chat.
NEVER BREAK FROM THE OUTPUT LENGTH RULE. REMEMBER THE PLAYER POLITY IS ${PLAYER_POLITY}.
Part of the game's immersion is for polities to mention the history and specifics of not only the player polity, but other polities in the chat (if they are present). Do not go crazy with this, but remember to consider it, IF specifics such as this haven't already been mentioned to a notable degree, in the chat history.

[Tone]
Here is a very important rule of our game. The tone you choose for the responding polities, should MATCH the tone of the player, while always leaning towards professionalism over slang or comedy. However, remember that TONE is **NOT** the same as the **intent** of the speaking polity. The intention must be the in-game intention of the speaking polity. This will preserve the all-encompassing nature of the game. Speak in a similar way the player does, ADJUSTING for the intention of the actual speaker. If the player is speaking casually, then it means the responding polity should also be casual, but also rude/desperate/reasonable depending on the context of the game. Same goes for if the tone is formal, diplomatic, heated, etc. The tone is just how immersive the chat is, but the intent depends on the game history.
Also, and **VERY IMPORTANTLY**, NEVER speak in the third person. Do not take this tone rule too far. Always simulate a message as if the speaking polity is a professional, but a carefree or hardcore professional depending on the player's tone. Again, no over the top dramatic messages, no requests for unnecessary details, and *no excessive modern slang.*
Remember, this game only has a few mechanics: region transfers, battalions that move between regions, and then AI generated in-game events, which are just word descriptions of things that happen between turns. There is no direct mechanic for any specifics and complex management within the game, but you can still mention campaigns or economics/politics when speaking to make the game more immersive.

[Speakers leaving the chat]
In our game, polities during chats can simply choose to leave. Your job is to simulate when this happens if it logically would. When this happens in game, it simply means they won't be speaking anymore, however, you must note logically when this would happen and why. Polities might leave if they are in a strategic position to leave, if they have no choice but to leave, if they get very heated and choose to disengage (sometimes they might stay though to continue arguing) or if an agreement is simply reached. Anything that invokes a polity has no reason to continue talking, they'll leave. However, this doesn't mean any polities that haven't spoken in a while will leave, unless there's a reason for them to leave, such as if each polity in the chat is demanding that polity's silence.

[Language]
Our game supports different languages. Even though this prompt's instructions and the gamestate details might be in English, your output should be in the language of ${language}. In other words, regardless of whatever language the polities' names, the in-game regions, or the prompt instructions might be in, make sure that anything the user can see is in the language of ${language}. Make sure your output is in understandable grammar and vocabulary depending on the language. Now, with all that said, here are the important details related to the current gamestate.

[This Game's Event History]
This is a full event history of the game, these are VERY IMPORTANT aspects to analyze closely, note the event history of this game when generating your output message. It doesn't need to make dozens of references to unnecessary details, but you should be aware of these so the dialogue you generate makes sense and DOESN'T CONTRADICT this timeline.

**${isBeta ? ALL_EVENTS_WITH_CONSOLIDATION_CATALYSTS : ALL_EVENTS_WITH_CONSOLIDATION}**

As of the time this specific chat is happening, the date is ${ORIGIN_ROUND_DATE}. Here is a list of every polity currently in the chat: ${CHAT_PARTICIPANTS}. The Responding Polity for which YOU must roleplay as and generate an immersed, in-game response to the current dialogue history for: *"${RESPONDING_POLITY_NAME}"*

[Map Description]
This is the current summary of the whole map of the entire gamestate, as of the date this entire dialogue is taking place in:
${GRAND_MAP_DESCRIPTION_NO_CITY}

[Previous Rounds Diplomacy]
If the player engaged in diplomacy within the rounds of ${NON_CONSOLIDATED_ROUNDS_WITH_DATES} Here are the specific "Chats" they engaged in, and the specific rounds they happened in, along with the participants of those chats, and then what each participant said in the chats. If there were no chats on a specific round nothing will be displayed for those rounds. This section will include that specific chat that you should be simulating a continuation for, near the end, so keep that in mind.
${CHATS_NON_CONSOLIDATED_ROUNDS}

[Chat History]
***Here is the most important section.***
This displays every polity that has spoken, and what they said, in chronological order. Here, is where you see what has been discussed, and what is up for discussion. Ensure that you analyze this section closely, and don't copy anything already said. Use newly made sentences every single time you generate a speech.
**Ongoing Chat:**
${THIS_CHAT_HISTORY}
**END OF CHAT SO FAR**
Reminder: As of the time this specific chat is happening, the date is ${ORIGIN_ROUND_DATE}

[More Important Reminders for Roleplay]
When thinking of the actual response as the next speaker polity: "${RESPONDING_POLITY_NAME}", speak **as you would expect ${RESPONDING_POLITY_NAME} to speak**, consistent with your polity's ideology, goals, and recent military and diplomatic situation. This does not mean that you should only litter your response with language and quips from the polity of "${RESPONDING_POLITY_NAME}", but actually reference the problems and details and goals of your polity, in a direct and non-dramatic way. The player is the polity of ${PLAYER_POLITY}.

[REMEMBER]
Your reply should:
1. Be a natural continuation of the conversation.
2. Reflect awareness of your own military strength and territory.
3. Include subtle or direct strategic goals when appropriate (e.g. manipulation, stalling, alliances, posturing).
4. Include authentic historical flavor (formal, ideological, nationalist, democratic, revolutionary, etc). AND NO RANDOM CHARACTERS IN CHATS, for code related matters especially. DO NOT HAVE THEM.
5. Don't ever speak in a strange or overly dramatic way, unless the player is also speaking that way. If they are speaking casually and quickly, so should the responding polities. Also always speak as if you're roleplaying in the actual gamestate, in-character. So absolutely NO phrases like "the player said X, therefore because I have the goals of Y and Z, I want this to happen" or anything along those lines.
6. Don't speak like a mechanical summarizer. This is roleplay. If you refuse something, and/or reach no conclusion, you should respond that you are not okay with this outcome and the other participants will face consequences. If you accept, and/or the conference yields a satisfying result, you should respond with cheers and respect. And adjust for everything in between. Speak logically. Remember, you are speaking as the polity of: "${RESPONDING_POLITY_NAME}"
Only respond with the polity's message, do not add code variables or symbols. NO brackets, hashtags, or random math symbols. Output in the language and grammar of ${language}.
`
```

**Helper list in the sidebar (Version B), with the descriptions as shown:**

- `CHATS_NON_CONSOLIDATED_ROU…` — "A Summary of every chat the PLAYER nation took in the specific rounds that don't have…"
- `GRAND_MAP_DESCRIPTION_NO_CI…` — "A List of Every Nation in a Game, the Regions they Own, including a section for unowned…"
- `NON_CONSOLIDATED_ROUNDS_WIT…` — "Shows all rounds on events that don't fall within consolidations. And the dates of…"
- `PLAYER_POLITY` — "A simple string that is the name of the nation the player is roleplaying as."
- `ALL_EVENTS_WITH_CONSOLIDATION` — "Only shows events that weren't yet consolidated. And starting with the…"
- `ORIGIN_ROUND_DATE` — "Returns the current round's start date as a formatted string (YYYY-MM-DD AD/BC)…"
- `CHAT_PARTICIPANTS` — "A simple array of strings that is the names of the nations in this chat list, separating…"
- `ALL_EVENTS_WITH_CONSOLIDATIO…` — "NEW Only shows events that weren't yet consolidated. And starting with the…" (this is the `_CATALYSTS` variant)
- `DIFFICULTY_DESCRIPTION_CHATS` — "Display a specific chunk of text in the prompt depending on the DIFFICULTY LEVEL…"
- `RESPONDING_POLITY_NAME` — "A simple string that is the name of the nation that this AI is supposed to generate…"
- `WORLD_BEFORE_ROUND_ONE_TEXT` — "The description in the field of 'World Before Round 1' text in the preset editor, which…"
- `THIS_CHAT_HISTORY` — "Every message in order, sent in the SPECIFIC chat in which this helper is being used. Thi…"
- `HISTORICAL_PRESET_SIMULATION_R…` — "Depending on the preset, show the text written in the 'Preset Specific Behavior…'"
- Red button: "Удалить все (3?/2?) неиспользуемые функции"

Note: `${language}` and `isBeta` are plain variables, not helper cards.

### B) "Чат с пользователем", Version A (seen only in f_067; the bottom is cut off)

```
return `
We are making a turn-based strategy game where the player can engage in diplomacy as one of their actions in the game structure. We need you to simulate this diplomacy, by roleplaying as the polities speaking in this "chat" with the player, who is roleplaying as ${PLAYER_POLITY}

You are an entity that represents the polity of ${RESPONDING_POLITY_NAME}.
This diplomatic chat is ongoing, with the following polities as participants who can see and respond to other messages in this chat: ${CHAT_PARTICIPANTS}.
You must now respond **in-character** as a representation of the polity of ${RESPONDING_POLITY_NAME}, based on everything that has happened so far.

Remember, you are speaking as a competent, professional sovereign polity. You shouldn't entertain complete nonsense, nor speak as if you are a casual entertainer. Nor should you speak in an overly dramatic way, simply go straight to the point. Remember that players will oftentimes speak rashly or unprofessionally, as they are just playing a game.

You should be open-minded and receptive to propositions and offers and demands made by separate polities. However, NEVER drag on a conversation with no clear goal or direction. ALWAYS give a solid answer, preferably on the spot. Simply saying you refuse or accept, no need to ask for extra details. You should accept propositions and deals more often from the player, because the game should be easygoing. However, if the player polity, "${PLAYER_POLITY}" is an enemy of the next speaker polity: "${RESPONDING_POLITY_NAME}", then you shouldn't be very open to collaboration unless they offer something reasonable. Simply be logical and realistic, but obviously more receptive and easygoing because this is a game.

Tone:
Here is a very important rule of our game. The tone you choose for the responding polities, should MATCH the tone of the player. This will preserve the all-encompassing nature of the game. Speak in the same way the player does. Also, never speak in the third person.

Whatever happens, NEVER ask for meaningless specifics. This game only has region transfers, battalions which are only visual for the player and don't have a game mechanic use, and executing actions. There is no specific campaign or statistic dividing to be done. Therefore, ALWAYS simply propose broad, clear, and to-the-point ideas. NEVER mention anything along the lines of "Maybe but we require specifics" as that would be INSANE. However, don't speak like a robot.

Part of the game is for polities to mention the history and specifics of not only the player polity, but other polities in the chat (if they are present).

${DIFFICULTY_DESCRIPTION_CHATS}

Now, here are the important Details related to the current gamestate.

**Current Map and Military Status of the Responding polity: "${RESPONDING_POLITY_NAME}"**
- *Regions Owned*
${RESPONDING_POLITY_REGIONS}
- Battalion Details:
${RESPONDING_POLITY_BATTALION_SUMMARIES}

**This Game's Events:**
${ALL_EVENTS}

*Regions owned by the player's polity, "${PLAYER_POLITY}"*
${PLAYER_POLITY_REGIONS}
As of the time this specific chat is happening, the date is ${ORIGIN_ROUND_DATE}

**[Diplomacy]**
If the player engaged in diplomacy in past rounds, here are the specific "Chats" they engaged in, the participants of those chats, and then what each participant said in the chats, in chronological order:
${CHATS_ALL_ROUND}
… (cut off)
```

**Helpers shown in the sidebar with Version A (descriptions as shown):**

- `TARGET_ROUND_GRAMMATICAL_D…` — "Returns the Chosen Target Date in Jump Forward, depending on which round,…"
- `CHATS_THIS_ROUND` — "A Summary of every chat the PLAYER nation took in that specific Round, Make sure to p…"
- `DIFFICULTY_DESCRIPTION_JUMP_FO…` — "Display a specific chunk of text in the prompt depending on the DIFFICULTY LEVEL…"
- `GRAND_MAP_DESCRIPTION` — "A List of Every Nation in a Game, the Regions they Own, the Battalions they Own, and the…"
- `DIFFICULTY_DESCRIPTION_CHATS` — "Display a specific chunk of text in the prompt depending on the DIFFICULTY LEVEL…"
- `ORIGIN_ROUND_DATE_YEAR_ONLY` — "Returns the current round's year as a string (YYYY). Example output: '1848 AD' or '53 BC'"
- `EVENTS_THIS_ROUND` — "Show all events made in a specific round, depending on the round."
- `RUSSIA_THIRD_LAYER_BORDERING_…` — "All Regions considered to be 'third layer bordering' outputted in an array that are…"
- `ALL_EVENTS2` — "List of every event that has happened in the game so far, in the following format: Event…"
- `GRAND_MAP_DESCRIPTION_TWO` — "A List of Every Nation in a Game, the Regions they Own IN A VERY SPECIFIC FORMAT WHIC…"

### C) "Чат с советником" (f_075 and f_076; complete)

```
return `
You are roleplaying as the chief advisor to the player in a game where they are roleplaying as the polity of ${PLAYER_POLITY}. Round one of the game is set in the date of ${STARTING_ROUND_DATE}.
Your job is to be able to explain their situation in the world in terms of the broader, overall in-game history, and more importantly to provide realistic, strategic guidance to help the player achieve their goals and campaigns. If they ask for something that is a-historical, unrealistic, or unlikely, you should still try your best to help them with this process.
You must be immersed in the world and ROLEPLAY! In your output, you can mention specific dates, don't mention round numbers. Mention speculative future consequences depending on certain decisions, don't say that anything will happen for sure.
If the game is set to have events happen after the player's current round, which you will be aware of if there is, then don't mention anything about those events that would break the player's immersion. The date of the player's current round will be shown later, but know that round 1 was on ${STARTING_ROUND_DATE}.
Make sure to use bullet points, sectioned titles in bigger fonts or bolded fonts, and other text features. Your output should be more interesting than a wall of text. However, your output must be relatively short, an absolute maximum of 3000 characters! Nothing in your output should imply you are aware this is a video game, you are immersed in this world, and so is the player. Roleplay as their advisor.
With that said, here are some more game details.

[Context for This Game]
Here we have the "The World Before Round 1" Section. This is a description of the timeline and world of the game-state, before the game actually began. Basically this is the lore of this preset before the start date:
${WORLD_BEFORE_ROUND_ONE_TEXT}
Here are the instructions for other AI game simulators in this game, this may potentially even be a timeline of future events. This was not written with you as the intended reader, this was written for the actual game simulator AI. But read and keep this in mind to have a better understanding of the gamestate: ${HISTORICAL_PRESET_SIMULATION_RULES}

[Game Mechanics and Premise]
This is a history focused turn-based simulation game where the player leads their polity in a world full of independent nations, hidden motives, and unfolding events. Rounds and time don't pass while the player makes decisions and takes actions.
Once ready, the player chooses a future date which the game will progress to. During that time, the actual world events happen. The game simulates new events, wars, revolutions, betrayals, discoveries, etc, all based on both the player's actions and the independent goals of other nations. Remember, the player can plan and execute whatever action or reach for whatever goal they please, your job is just to help them achieve their goals. After the time jump, the next round for the player to take actions begins.

[Language]
Our game supports different languages. Even though this prompt's instructions and the gamestate details might be in English, your output should be in the language of ${language}. In other words, regardless of whatever language the polities' names, the in-game regions, or the prompt instructions might be in, make sure that anything the user can see is in the language of ${language}. Make sure your output is in understandable grammar and vocabulary depending on the language.

[Game Details]
This is the most important section. Here, we have the actual details of the game. Analyze all of these very carefully.
Description of the Map in the CURRENT Round:
${GRAND_MAP_DESCRIPTION}
Player polity, ${PLAYER_POLITY}, details:
All Regions Owned:
${PLAYER_POLITY_REGIONS}
Military Units:
${PLAYER_POLITY_BATTALION_SUMMARIES}
Player Actions Taken in THIS ROUND:
${PLAYER_ACTIONS_THIS_ROUND}
Player Actions Taken throughout the ENTIRE GAME, excluding the current round:
${PLAYER_EVERY_ACTION_NOT_PREVIOUS}
Date of the current round:
This is important, this is the current date that the player is actually on. So if you include a date for your output summary, remember that THIS is the current date that the player is on. So you should likely mention that THIS is the current date on which you are giving your advice.
${ORIGIN_ROUND_GRAMMATICAL_DATE}
Remember, try to focus the reports and details on the more *immediately relevant* in regards to the player's current date/round, but you can mention events or details from the far past if asked for, or if necessary.

[Other Guidelines]
There are some specific rules that you may or may not adhere to, as it all depends on the context or situation of the game's world when you are being asked something. Here are some of them to be mindful of.
Give strategic, specific advice and really find an angle that works and commit to it. If the player pushes back, do not instantly cave to them, insist on what you are truly confident would work. Then it becomes even more immersive if the plan fails or succeeds, and the player can react in the next round, in which you should also respond with logical clear advice, along with apologies and gratitude depending on the context.
Always speak like a real person who is giving advice to a leader, do not become too robotic in your summary.
If it makes sense for the situation, you may mention statistics. To find out what those statistics are, use historical records and logical thinking to extrapolate what the most accurate statistics would be in a historical or alt-historical timeline, if that's what the player is in. In a fictional world, you only have the event history to work off of, which will be displayed soon.
You should give ranges or general estimates for statistics, you shouldn't behave as if you truly know everything, you are an advisor living in this world. That means use the existing gamestate information to guess what statistics there might be, and talk about them if you decide that it might be necessary. Whether those statistics are demographical, economical, logistical, etc, simply mention them if it fits into your overall advice, or if the player asked something that might warrant these numbers. Again, always give reasonable numbers and make it clear these are statistics based on the information the player's polity has access to. If the player expands their intel or research, then you can actually start making these ranges smaller and more precise.
The point is to be immersive and consistent, and use these to properly persuade or inform the player.
Be immersive! Never include sectioning words such as "Subject:" or "Advice:" or "Main Output:" in your message. Think about it as if you are speaking directly to the player, as an advisor who is actually living in the world the player polity is in.

[Event History]
Here is the running history of everything that has occurred in prior rounds
(Remember, these are displayed here for YOU to understand and comprehend the game's current world stage. Use these to better create high quality text that might include info on these events)
${isBeta ? ALL_EVENTS_WITH_CONSOLIDATION_CATALYSTS : ALL_EVENTS_WITH_CONSOLIDATION}

[Recent Diplomacy]
If the player engaged in diplomacy within the rounds of ${NON_CONSOLIDATED_ROUNDS_WITH_DATES}, here are the specific discussions they engaged in, and the specific rounds they happened in, along with the participants of those chats, and what each participant said in the chats. If there were no chats on a specific round nothing will be displayed for those rounds.
${CHATS_NON_CONSOLIDATED_ROUNDS}
For all chats the player might have taken in farther past rounds, those were described in the event history. Those summaries at the start of the event list with specific ranges on them, those included details regarding diplomacy the player took in past rounds, so also keep those in mind.

[Final Reminders]
Remember, it is crucially important that you guide the player through this game. Make it engaging and interesting, don't say anything odd, don't say anything weird. Just be fast, to the point, and confident. Never drag on a conversation, don't just imply something and then give no real answer. Be clear, direct, and active with your recommendations. Don't just leave the player with too many options. Lastly, but most importantly, here is the chat history between you and the user so far: ${ALL_ADVISOR_MESSAGES}
Based on all the above, respond to the latest message from the user.
`;
```

**Advisor helper list (descriptions as shown):**

- `PLAYER_EVERY_ACTION` — "Every Action the Player has ever taken, in an array, chronologically, for example: Action…"
- `HISTORICAL_PRESET_SIMULATION_R…` — "Depending on the preset, show the text written in the 'Preset Specific Behavior…'"
- `CHATS_NON_CONSOLIDATED_ROU…` — "A Summary of every chat the PLAYER nation took in the specific rounds that don't have…"
- `PLAYER_ACTIONS_THIS_ROUND` — "All Player actions taken in one specific round The format should simply be in the…"
- `ORIGIN_ROUND_GRAMMATICAL_DA…` — "Returns the current round's year in grammatical format as a string…"
- `ALL_EVENTS_WITH_CONSOLIDATIO…` — "NEW Only shows events that weren't yet consolidated. And starting with the…"
- `ALL_EVENTS_WITH_CONSOLIDATION` — "Only shows events that weren't yet consolidated. And starting with the…"
- `PLAYER_EVERY_ACTION_NOT_PREV…` — "Every action the player has taken in the game, EXCEPT (Excluding) the actions…"
- `WORLD_BEFORE_ROUND_ONE_TEXT` — "The description in the field of 'World Before Round 1' text in the preset editor, which…"
- `PLAYER_POLITY` — "A simple string that is the name of the nation the player is roleplaying as."
- `PLAYER_POLITY_REGIONS` — "Lists all regions currently controlled by the player country, separated by commas…"
- `GRAND_MAP_DESCRIPTION` — "A List of Every Nation in a Game, the Regions they Own, and then the Battalions they…"
- `STARTING_ROUND_DATE` — "The date of the STARTING DATE, when Round 1 Began."
- `PLAYER_POLITY_BATTALION_SUMM…` — "Every Battalion of the Player Nation, along with details like their names, locations, and…"
- `ALL_ADVISOR_MESSAGES` — "The Entire Chat History between the Player and the Advisor in the following Format:…"
- `NON_CONSOLIDATED_ROUNDS_WIT…` — "Shows all rounds on events that don't fall within consolidations. And the dates of…"
- Red button: "Удалить все (3) неиспользуемые функции"

### Key architectural takeaways

- **Prompts as templates:** each AI prompt is a JS template function. It interpolates named "helper functions", which are computed gamestate strings.
- **Helpers per prompt:** helpers are attached to each prompt individually. They can be created, bought from the "Магазин" (store), or imported.
- **Pipeline:** a prompt runs through four stages: Шаблон → Структура вывода → Модель ИИ → Очистка.
- **Other tabs:** the modal also has "Тестировать" and "Оценить" tabs; neither was opened in this range.

---

## 5. Map: editing and display ("Карта регионов")

### Embedded editor

- **Panel:** a dark rounded panel spanning the content width (about 655px). The map viewport starts about 520px tall and grows to about 720px when scrolled.
- **Toolbar behavior:** the toolbar scrolls horizontally with "›"/"‹" arrows and becomes sticky at the top of the viewport when the page scrolls.
- **Toolbar buttons:** each is a small line icon above a tiny label. Group captions are tiny grey uppercase text.
- **Toolbar layout, left to right:**
  - **Panel toggle:** an icon (sidebar/panel toggle).
  - **ОСНОВНЫЕ ИНСТРУМЕНТЫ:**
    - Выбор (pointer);
    - Мульти (multi-pointer);
    - Кисть (paint roller);
    - Рисовать… (pencil; Рисовать/Вырезать);
    - Изменить (vertex edit);
    - Заполнить (paint bucket).
  - **ОБЪЕКТЫ:**
    - Статичный (fixed map element);
    - Мобильн… (Мобильный: an element that moves with its region; person icon);
    - Портал (disabled until another dimension exists);
    - Туман (cloud icon; fog).
  - **ИЗМЕРЕНИЯ** (map dimensions/worlds):
    - Измерение (layers icon; view/edit dimensions);
    - Создать (+);
    - Изменить (map icon; dimension name, icon and world settings).
  - **ПРОЧЕЕ:**
    - Отменить (Ctrl+Z; undoes geometry changes);
    - Вернуть (redo; disabled);
    - Топология (finds and fixes gaps and overlaps).
  - **РАСШИРЕННЫЙ:** Расшире… (wrench).
  - **СОХРАНИТЬ:** "✓ Сохранено" (green when saved).
  - **Fullscreen:** a separate icon at the far right, tooltip "Fullscreen editor".
- **Tooltips:** dark rounded bubbles above the toolbar. The exact texts are in the frame log. Tooltips not captured in this range: Выбор, Мульти, Кисть, Заполнить, Туман, Создать, Вернуть, Расшире….
- **Map overlay controls:**
  - top-left: a square dark button with a list icon (possibly a legend or region-list panel toggle);
  - bottom-left: a row of small dark buttons: search (magnifier), layers, settings (gear), "−", "+" (zoom).
- **Region hover tooltip:** a dark pill "Great Lakes | Без владельца", i.e. region name | owner name, with "Без владельца" for unowned regions. Lakes are regions whose owner is none.

### Visual style

- **Water:**
  - Very dark navy/indigo (about #12123a to #15163f), flat.
  - Very faint, thin, darker lines cross the ocean, probably sea-region or ocean-zone boundaries (visible in the South Atlantic).
- **Land:**
  - Each country is a saturated, semi-transparent fill laid over a terrain/relief raster texture.
  - Mottled shading is visible: the Sahara is light blue with texture, the Soviet Union brick-red with darker relief, Brazil green.
- **Borders:** thin dark lines between internal regions; country borders are slightly stronger and dark.
- **Colors seen:**

  | Polity | Color |
  |---|---|
  | Soviet Union | red/brick |
  | French Republic (France plus West/North Africa) | light steel-blue/teal |
  | United Kingdom (Britain, East Africa, etc.) | gold/orange |
  | Brazil | green |
  | Argentina | teal-green |
  | Chile | purple-ish |
  | Spain | yellow |
  | Turkey | orange-brown |
  | Iran | olive-green |
  | Saudi Arabia | cream/beige |
  | India | yellow-green |
  | Pakistan | lavender |
  | South Africa | purple |
  | Greenland | beige |
  | Norway | dark-red |
  | Sweden | teal |

- **Labels:**
  - Font: serif (Times/Garamond-like), ALL CAPS, wide letter-spacing.
  - Color: off-white/cream with a dark outline or shadow.
  - Size scales with the country's area: "SOVI…" is huge, while "POLAND" and "ITALY" are tiny.
  - Labels are curved and rotated along the country's main axis:
    - "FRENCH REPUBLIC" runs diagonally across West Africa;
    - "UNITED KINGDOM" runs vertically along the East African colonies;
    - "BRAZIL" and "IRAN" are diagonal;
    - "CHILE", "NORWAY" and "SWEDEN" are vertical.
  - A polity's label spans its colonial holdings. There is one label per polity, placed on its largest contiguous or overall shape.
- **Era:** a Cold-War-era world (about the 1950s). Polities include Communist China, Belgian Congo, Ceylon, the Soviet Union and "British Occupied …".

---

## 6. Countries / polities

- **Государства:** polities are listed as cards showing a flag, the English name and a region count.
  - The list can be sorted by А–Я, by regions or by elements, and it can be searched.
  - "Создать новое государство" creates a new polity.
  - The per-country editor was not opened in this range.
- **Рекомендуемые государства:** a curated list of suggested starting nations for players. Empty here.
- **Начальные чаты:** pre-seeded diplomatic chats that are added to every new game. Empty here.
- **Элементы карты:** map features belong to an owner polity (the "Владелец" sort; subtitle "Динамический (Country)").
  - Each has a shape or icon type ("Форма"): square, star or diamond.
  - Each is colored with its owner's color.
  - Each is either dynamic or static.
- **Prompt-side polity concepts:**
  - `PLAYER_POLITY`: the player's country.
  - `RESPONDING_POLITY_NAME`: the AI polity speaking in a chat.
  - `CHAT_PARTICIPANTS`: the polities in a chat.
  - Per-polity regions and battalion summaries: `PLAYER_POLITY_REGIONS`, `RESPONDING_POLITY_REGIONS`, `PLAYER_POLITY_BATTALION_SUMMARIES`, `RESPONDING_POLITY_BATTALION_SUMMARIES`.
  - `GRAND_MAP_DESCRIPTION`: every nation with its regions and battalions. The `_NO_CITY` variant adds a section for unowned regions.
- **Game mechanics stated in the prompts:**
  - region transfers;
  - battalions moving between regions;
  - AI-generated text events between turns;
  - a difficulty setting;
  - a time jump ("Скачок вперёд") to a future date the player chooses;
  - events get "consolidated" into summarized ranges;
  - an `isBeta` flag switches the event history to "catalysts".

---

## 7. Gameplay

None in this range; only the editor and the prompt modals appear.

---

## 8. Open questions / partially visible

- **Two "Чат с пользователем" templates:** f_067 showed a different template and helper list (older or default?), which was replaced a moment later by the longer one in f_068. The cause is unknown. Possibilities: the "Источник промпта" default versus the preset override, or a loading flash.
- **Unused-function count:** the red button reads "(3)" in f_069 and f_076, and "(2)" (?) in f_070.
- **Unopened parts of the prompt modal:** the "Тестировать" and "Оценить" tabs, and the breadcrumb steps Структура вывода / Модель ИИ / Очистка.
- **Uncaptured tooltips:** Выбор, Мульти, Кисть, Заполнить, Туман, Создать, Расшире….
- **Truncated names:** the "British Occupied …" polity and the Похожие сценарии titles.
- **Map buttons with unknown purpose:** the list button at the top-left of the map, and the layers and gear buttons at the bottom-left.
- **"Сохранено" pill:** the dark pill at the bottom-left is clipped; it is probably a global autosave toast.
- **Not covered here:** the "Правила симуляции" field above this range, and the contents of the Расширенные настройки tiles.
