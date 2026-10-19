REPORT: Pax Historia frames f_115 to f_152 (preset editor: AI prompt templates, advanced settings modals, and the map-elements and polities lists)

All 38 frames were read. Small text was cropped and upscaled to check it. The crops are in C:/Users/remote77/AppData/Local/Temp/claude/C--Users-remote77--claude-spares-spare-Uv1u1c/b2995ddc-907b-4dbb-a8c8-74eee64fdbea/scratchpad/crops3/

The whole range is the preset (scenario) editor page. The user does four things in it:
- Opens four AI prompt templates one at a time and scrolls through each: "Создание катализатора" (Catalyst Creator), "Исполнитель катализатора" (Catalyst Runner), "Обобщитель катализатора" (Catalyst Summarizer) and "Мастер игры" (Game Master).
- Opens the three "Расширенные настройки" (Advanced settings) modals.
- Scrolls up through the map-elements grid.
- Scrolls further up to the polities ("Государства") list and the map preview.

No gameplay appears in this range.

======================================================================
1. PER-FRAME LOG
======================================================================
- f_115: Full-screen modal "Редактировать промпт" (Edit prompt, top-left; the first letter is clipped). Prompt title "Создание катализатора" with an orange flame icon. Tabs: "Источник промпта" | "Редактировать" (active, blue, underlined) | "Тестировать" | "Оценить". Breadcrumb: "Шаблон > Структура вывода > Модель ИИ > Очистка". Left panel is "Вспомогательные функции шаблонов" (helper list). Code editor "Функция шаблона" shows the start of the prompt: return `...
- f_116 and f_117: Scrolling the Catalyst Creator prompt. The page scrolls as a whole, so the tabs and helper list move off the top.
- f_118: Scrolled further. The "[Actual Game Details]" section with ${...} variables and the "Reminders" list are visible.
- f_119: End of the prompt (`;). Below the editor is a wide, dim purple bar labelled "Ассистент конвейера" (Pipeline assistant). Bottom-left link: "Закрыть". Bottom-right green button: "Сохранить промпт".
- f_120: Modal closed. Back on the preset page, scrolled to the end of the map-elements grid, then "Подсказки ИИ" (12 tiles), "Расширенные настройки" (3 tiles) and "Похожие сценарии".
- f_121: Hovering the "Исполнитель катализатора" tile shows the tooltip "Настроить, как выполняются катализаторы" (Configure how catalysts are executed).
- f_122: Edit-prompt modal for "Исполнитель катализатора" (gear icon). It has a different helper list (see section 3).
- f_123: Scrolled. The "[Length/In-game Duration of the Catalyst]", "[What the player is]" and "[Catalyst Progress]" sections are visible.
- f_124 and f_125: End of the Runner prompt. "[Game Details]" through "Given this, begin outputting." are visible. Frames between f_123 and f_124 were skipped, so part of the text is missing.
- f_126: Back on the preset page; the cursor is near the top-right.
- f_127 and f_128: Edit-prompt modal for "Обобщитель катализатора" (document/pencil icon). The full prompt is visible.
- f_129: End of the Summarizer prompt, plus the "Ассистент конвейера" bar.
- f_130: Back on the preset page.
- f_131: Cross-fade between the preset page and the "Мастер игры" prompt modal (the modal is opening).
- f_132 to f_134: "Мастер игры" (dice icon) edit-prompt modal, top of the prompt. The cursor moves around the "Шаблон" breadcrumb.
- f_135 to f_138: Scrolling the Game Master prompt to the end ("Now, Begin:").
- f_139: Scrolled back to the top of the Game Master modal.
- f_140: Back on the preset page.
- f_141: Hovering "Настройки консолидации событий".
- f_142 and f_143: Modal "Настройки консолидации" (Consolidation settings). The user moves to its X button.
- f_144: Modal "Параметры отображения карты" (Map display settings) fading in.
- f_145: The map display modal fully open.
- f_146: Modal closed. Hovering the "Похожие сценарии" cards.
- f_147: Clicking "Размер документа"; the modal starts fading in.
- f_148 and f_149: Modal "Размер документа" (Document size). The user hovers its X.
- f_150: Page scrolled up. The full map-elements grid (first three rows) and its filter bar at the top are visible.
- f_151: Scrolled further up. Sections "Вступительные слайды >", "Государства", "Рекомендуемые государства" and the start of "Начальные чаты" are visible.
- f_152: Scrolled up a little more. The bottom of the embedded map preview is visible above "Вступительные слайды".

======================================================================
2. SCREENS AND NAVIGATION
======================================================================

Global top bar (dark):
- Left: globe logo and "Pax Historia".
- Centre nav: "Игры" (gamepad icon), "Пресеты" (play icon; active, purple pill), "Ассеты" (cubes icon), "Сообщество" (people icon).
- Right: a grey gift icon button, a currency pill (gold coin, "$3.264"), a bell, and a blue circular avatar "M".

Floating indicators:
- Bottom-left grey toast: "Сохранено" (the first letters are clipped at the screen edge). It shows on every preset-page frame, which suggests autosave.
- Bottom-right small link: the name of the current section. It reads "Элементы карты" (f_120–f_150), "Государства" (f_151) and "Карта регионов" (f_152). This looks like a section-jump / table-of-contents widget.

Sections of the preset editor page, top to bottom, as seen in this range:
1. Map preview, an embedded interactive map. The section label is "Карта регионов". Bottom-left controls: search (magnifier), layers (stacked squares), settings (gear), "−", "+".
2. "Вступительные слайды >" (Intro slides). This is a header with a right chevron, so it probably opens a sub-page or collapses.
3. "Государства ⌄" (Polities, collapsible):
   - Blue button "Создать новое государство".
   - Search box "Поиск государств..."
   - Sort buttons: "А-Я ^" (active, blue), "Регионы", "Элементы".
   - A grid of cards, 6 per row.
   - "Больше государств" (expand) button.
4. "Рекомендуемые государства ⌄" (Recommended polities):
   - Blue button "+ Добавить рекомендацию".
   - Dashed empty-state box with a crown icon in a circle.
   - Empty-state title: "Рекомендуемых государств пока нет".
   - Empty-state text: "Добавьте рекомендуемые государства, чтобы помочь игрокам выбрать интересную стартовую нацию при игре в этот пресет."
   - Button "+ Добавить первую рекомендацию".
5. "Начальные чаты ⌄" (Initial chats):
   - Blue button "+ Добавить чат".
   - Subtitle: "Беседы, добавляемые в каждую новую игру с самого начала."
   - Dashed empty box with a chat icon: "Пока нет начальных чатов".
6. "Элементы карты" (Map elements; the heading itself is off-screen):
   - Filter bar (blurry): a search field "Поиск элементов карт..." (?), a button "Фильтры" (?) with a sliders icon, and on the right a blue sort button (probably "А-Я") plus two more buttons, probably "Владелец" (?) and "Форма" (?).
   - A 6-column grid of cards.
   - "Больше элементов карты" (expand) button.
7. "Подсказки ИИ ⌄" (AI prompts): a 4×3 grid of large tiles, each with an emoji-style icon and a label:
   - Row 1: "Чат с пользователем" (speech bubble), "Чат с советником" (pink brain), "Скачок вперёд" (calendar), "Автоматический скачок вперёд" (blue fast-forward ⏭).
   - Row 2: "Действия" (lightning), "Следующий говорящий" (microphone), "Описание в действие" (sparkles), "Объединитель событий" (document).
   - Row 3: "Создание катализатора" (flame), "Исполнитель катализатора" (gear), "Обобщитель катализатора" (document with pencil), "Мастер игры" (die).
   - Hovering a tile shows a one-line tooltip. Only the Runner tooltip was captured: "Настроить, как выполняются катализаторы".
8. "Расширенные настройки ⌄" (Advanced settings): three wide tiles, "Настройки консолидации событий" (document icon), "Параметры отображения карты" (map icon) and "Размер документа" (bar-chart icon).
9. "Похожие сценарии ⌄" (Similar scenarios): a carousel of cover-image cards:
   - "1980 ПРЕСЕТНА…" (?), a tank photo.
   - "RUSSIA [TRUE] COLLAPSE 2027", a Kremlin image.
   - "РАСШИРЕННАЯ ВЕРСИЯ / РУССКИЙ ..." (?), planes.

Edit-prompt modal ("Редактировать промпт"):
- A full-screen dark overlay, title at top-left.
- Header: an icon plus the prompt name, e.g. "Создание катализатора".
- Tab row: "Источник промпта", "Редактировать" (selected in every frame), "Тестировать", "Оценить". The contents of the other tabs were not shown.
- Left column: "Вспомогательные функции шаблонов" (Template helper functions).
  - Sub-tabs: "Новая функц..." (active, blue; probably "Новая функция"), "Магазин" (Store), "Импортировать" (Import; first letter clipped).
  - Search field: "Поиск функций..."
  - A list of helper cards. Each card has an UPPER_SNAKE_CASE name in bold and a truncated grey English description.
  - At the bottom, a red pill button: "Удалить все (1) неиспользуемые функции" (Delete all (1) unused functions). This shows a helper is listed but not referenced in the template.
- Right column:
  - Breadcrumb / steps: "Шаблон > Структура вывода > Модель ИИ > Очистка" (Template > Output structure > AI model > Cleanup). This is a four-stage pipeline per prompt; only "Шаблон" was shown.
  - Label "Функция шаблона" (Template function).
  - A large monospace code textarea (dark grey) holding a JS template-literal function body: `return \`...\`;` with ${VARIABLE} interpolations.
- Below the editor: a full-width, purple-tinted bar "Ассистент конвейера" (Pipeline assistant), probably an AI helper input.
- Footer: "Закрыть" (blue text link, bottom-left) and "Сохранить промпт" (green button, bottom-right).

======================================================================
3. SCENARIO / PRESET EDITOR STRUCTURE
======================================================================

3a. Prompt template system

Each AI prompt is a JavaScript-like function body that returns a template literal. Variables use ${UPPER_SNAKE} syntax, except ${language}, which is lowercase. Helpers seen in the side lists, with their descriptions as shown (truncated text ends in "…"):

- HISTORICAL_PRESET_SIMULATION_R… (probably _RULES): "Depending on the preset, show the text written in the "Preset Specific Behavior…"
- PLAYER_POLITY: "A simple string that is the name of the nation the player is roleplaying as."
- ALL_EVENTS_WITH_CONSOLIDATIO… (= ALL_EVENTS_WITH_CONSOLIDATION_CATALYSTS in the Creator and Runner text): "NEW Only shows events that weren't yet consolidated. And starting with the…"
- ALL_EVENTS_WITH_CONSOLIDATION (Game Master list; same description without "NEW"): "Only shows events that weren't yet consolidated. And starting with the…"
- RUNNING_CATALYST_DATE: "The date presented in Month Date, Year. So for example, January 1st, 1940. Proper…"
- PLAYER_ACTIONS_THIS_ROUND: "All Player actions taken in this one specific round The format should simply be in the…"
- PREVIOUS_ROUND_EVENTS: "Shows all events in chronological order in format, Headline: Date: Description: Of the…"
- WORLD_BEFORE_ROUND_ONE_TEXT: "The description in the field of "World Before Round 1" text in the preset editor, which…"
- CATALYST_ATTACHED_EVENT: "The event attached to the specific catalyst in which this helper is called, presented in:…"
- CATALYST_SIMULATION_HISTORY: "This is the simulation history made by the Catalyst Creator and runner Prompts,…"
- RUNNING_CATALYST_PERCENT: "The current percent towards completion of the catalyst."
- CATALYST_PREMISE_DESCRIPTION: "This is the description made by the Catalyst Creator Prompt that represents the setting…"
- NUMBER_OF_REGIONS: "The Number of Regions in this Map"
- GAME_MASTER_PLAYER_REQUEST: "Returns the player's direct command or request as entered into the game master…"
- ORIGIN_ROUND_DATE: "Returns the current round's start date as a formatted string (YYYY-MM-DD AD/BC)…"
- GRAND_MAP_DESCRIPTION_NO_CI… (= GRAND_MAP_DESCRIPTION_NO_CITY in the text): "A List of Every Nation in a Game, the Regions they Own, including a section for unowned…"
- ${language}: used in the text but not listed as a helper. It appears to be built in.

Helper lists per prompt:
- Создание катализатора: HISTORICAL_PRESET_SIMULATION_R…, PLAYER_POLITY, ALL_EVENTS_WITH_CONSOLIDATIO…, RUNNING_CATALYST_DATE, PLAYER_ACTIONS_THIS_ROUND, PREVIOUS_ROUND_EVENTS, WORLD_BEFORE_ROUND_ONE_TEXT. No "unused" button was visible in the frame.
- Исполнитель катализатора: PLAYER_POLITY, CATALYST_ATTACHED_EVENT, HISTORICAL_PRESET_SIMULATION_R…, WORLD_BEFORE_ROUND_ONE_TEXT, RUNNING_CATALYST_DATE, CATALYST_SIMULATION_HISTORY, ALL_EVENTS_WITH_CONSOLIDATIO…, RUNNING_CATALYST_PERCENT, CATALYST_PREMISE_DESCRIPTION, then "Удалить все (1) неиспользуемые функции".
- Обобщитель катализатора: WORLD_BEFORE_ROUND_ONE_TEXT, CATALYST_ATTACHED_EVENT, CATALYST_SIMULATION_HISTORY, HISTORICAL_PRESET_SIMULATION_R…, RUNNING_CATALYST_DATE, CATALYST_PREMISE_DESCRIPTION, then "Удалить все (1) неиспользуемые функции". CATALYST_ATTACHED_EVENT is absent from the visible text, so it is likely the unused one.
- Мастер игры: NUMBER_OF_REGIONS, HISTORICAL_PRESET_SIMULATION_R…, GAME_MASTER_PLAYER_REQUEST, PLAYER_ACTIONS_THIS_ROUND, WORLD_BEFORE_ROUND_ONE_TEXT, ORIGIN_ROUND_DATE, GRAND_MAP_DESCRIPTION_NO_CI…, ALL_EVENTS_WITH_CONSOLIDATION, PLAYER_POLITY, then "Удалить все (1) неиспользуемые функции". ALL_EVENTS_WITH_CONSOLIDATION is not in the visible GM text, so it is likely the unused one.

3b. PROMPT TEXT, transcribed verbatim where legible. "[...gap...]" marks text skipped between frames.

--- PROMPT: "Создание катализатора" (Catalyst Creator) ---
return `
We are creating an A.I. powered turn-based strategy game. In the game, the player will roleplay as a polity in a historical, alt-historical, or fictional world-stage.

In our game, "polities" are the entities that interact with the world. They could be countries, warlords, or even people. However, a Faction or Alliance of separate polities is NOT one polity.

Your job is to make the game more fun by simulating an extra mechanic we have in this game. We're calling this mechanic "Catalysts."

A "Catalyst" is a specific in-game scenario/event that the player can experience and simulate in more detail. In the gameplay loop, the Catalyst will happen as soon as the player ends their turn.

Your job is to choose and describe an immersive setting for the Catalyst, and begin the first step of the Catalyst simulation.

Here's how it's gonna work:
We will give you the details, being the headlines and descriptions, of each event that happened after the player ended their previous turn. The player is currently at the start of their new turn, which is the end of the previous round.
We will also give you the actions that the player took that round, which are set to begin implementing directly after the final event of the event list.
Then, based on the events list and the player's actions, figure out a game-relevant but also fun and immersive specific setting that would logically happen as of the date the player is currently on. This setting will be the setting of the Catalyst. It could be similar to the premise of one of the events in the list we show you, except it would be as of the date the player is on, not the original date of that event. Or it could be the final event in the event list we show you, with the fun part being the reaction to the player's actions. So for example, if one of the events in the list we give you is the launching of Operation Barbarossa in the Historical simulation of WW2, then a good Catalyst if the player is currently some time after that event would be a specific battlefield in progress or a group of soldiers in the army having a discussion while stationed in the eastern front. Or, if the final event is something contextualizing something notable, such as the Remilitarization of the Rhineland, and the player chooses to take that action, then the Catalyst could be literal German troops entering the Rhineland. Either way, it must be something immersive and fun to simulate, and also logically would happen directly after the final event in the event list and the beginning of the implementation of the player's actions.

If no events in the list would make a fun Catalyst, you may also think up your own custom Catalyst, but it must align with the game-history and logically could happen during the date the player is on.

[What the player is]
In the game overall, the player plays as a "polity" which could be a nation/figure/faction of any kind. However, this isn't inherently what they play as, not in the game nor in the catalyst. They are more like an entity who has control to sway the actions of historical polities, and are sometimes in control but also sometimes can only influence/advise. Whatever makes the simulation game more fun. However they aren't exactly an actual person or being who is in the catalyst or in the game overall, they are an entity who has the control to simulate the timeline. Just like in most other strategy games, it is up to the player. Sometimes they will choose to roleplay as a specific entity in the actual Catalyst, and sometimes they are an invisible observer who has sway.

This means that relevant or important figures of a catalyst that would logically be there, should all be present and active, and the player could but isn't inherently roleplaying as any one of them. Those figures should behave depending on what's fun in the situation, even if they're someone who doesn't talk they should be noted as present and remaining silent. This is going intricate but the point is, be descriptive and specific with your descriptions.

However, the player should not be given too much power. They are still within the confines of representing their nation as a whole. This is meant to be a bit vague and abstract on purpose, as the game is meant to be fun and engaging so the player must still be some kind of entity within the geo-politics of their polity, but it is not meant to be too trapping either which is why the player isn't directly roleplaying as a figure. So keep in mind what polity the player is, it wouldn't make sense for them to be able to take actions for figures or entities of a different polity, but they can have free reign over the general direction of the catalyst and influence the behavior of the figures or entities of their polity.

Keep this in mind, it is an important detail/aspect.

[Details of your Output]
There are several details for you to specifically output:

First, output a passage describing the premise of the event that the Catalyst represents. That description should make it clear when the specific event the Catalyst is a simulation of would begin and end. So for example a Catalyst about a debate or speech could start with the debate room, perhaps a parliament, and each figure awaiting the discussion, or it could start in the middle of a long-lasting meeting and be specifically about the engaging part. However, note that a meeting is often mundane and boring, and most catalysts should NOT be simple meetings. The premise description should include these clear details, and of course a description of what exactly is happening in the Catalyst, probably including details on each figure, the location, the context, the history, the lore, etc.

Then, you must also have an opening section of narration and/or actual dialogue that is the actual simulation of the Catalyst itself. If the Catalyst is a historical or documented event, adhere to how that documented event unfolded but make way for potential change due to the player's presence. Also keep in mind what the player is. Not a figure directly living in the game and present in the Catalyst, but an entity who can steer or control the simulation as a whole. Just like how they play as a political entity like a polity in the overall game. They aren't inherently the actual leader or ruler or even figure if their polity is just a person, such as a warlord, the player is just the political entity or polity as a whole. Balance the word count of dialogue and text narration. It should never look like a wall of text.

Finally, you must output a list of choices for the player to take to continue progression of the Catalyst. The Catalyst also has turns like our game's "rounds" except they are just continuations of the Catalyst simulation. Since you are just creating the Catalyst, these actions should be coherent and direct, not necessarily contrary to each other but different. Something that when chosen, would make clear what side the player is trying to take or what objective the player has in the actual Catalyst. Also remember that it could also be that the player has no objective and only wishes to observe the Catalyst simulate for fun.

**[Important Guidelines]**
Catalysts are NOT a clone of one of the listed events with nothing but extra detail and specificity.

They should reflect the notable and memorable gems of a timeline, and the Catalyst itself can just be a subsection of a larger overall event.

Here are some examples of good events from a potential event list, and Catalysts you could create from those:
Event: The beginning/continuation of an overarching military campaign or expedition
Catalyst: A specific battle of that campaign, probably the most numerous or geo-politically relevant of that specific expedition (Make sure it's something that makes sense or at least is possible to be happening as of the date the player is on).

Event: A notable battle that occurred in an overall war or campaign.
Catalyst: A specific stage of that battle, it could be a duel or negotiation that happens directly prior to the battle if that's in-line with the actual game history and makes sense to happen between whoever's fighting. Or it could be the arrival of a renowned military leader at the battlefield, as they take over the command and begin turning the battle around with a newly introduced strategic genius.

Event: A diplomatic envoy from one polity to another with specific intentions and hopes for the outcome of the meeting from each side.
Catalyst: The leading diplomat(s) or most trusted delegate(s) of one polity having a *debate* with the diplomat(s) of the other side. This example is only good if this event was the last one in the list because remember when the catalyst takes place is during the player's turn, which is directly after the final event in the list.

Event: A polity committing itself to a specific policy after many months or rounds worth of contemplation.
Catalyst: A speech, or even battle, that reflects that policy-change event. For example if the polity or polity's leader is choosing a policy of war after much political turmoil, a good catalyst would be the polity announcing this to its people, whatever form that would take. Remember, countries and states can't be figures in the catalyst, the catalyst is on the micro scale so it must include real figures.

Event: The official surrender of a polity at war.
Catalyst: The specific scene of the polity's leaders or command-structure choosing to accept surrender for whatever reason, if that would make a fun and immersive scene. Or it could be the actual peace treaty meeting discussing the policies, outcomes, and terms of the surrender by each of the participating members and/or mediators, if that's something that's possible to happen as of the date the player is on. But remember, that should only be the case if it is a specifically important or historically notable meeting, such as the Congress of Vienna, etc.

Event: The implementation of research or technology reforms within the player's polity or one of the player's allies.
Catalyst: The discovery or revelation of something very important to the player's polity. Perhaps a foreign polity's secret(s), or a very useful/notable scientific discovery, including relevant in-game figures or entities finally solving or discovering this detail.

An important thing to note is that none of these examples are consistent with each other. Some catalysts will happen in the span of a couple minutes, some of them an entire or two days. A Catalyst cannot span months though, three days maximum, if it's something longer then the catalyst would just be the simulation of a section of that specific event and not the whole thing. Also, some catalysts would require a lot of dialogue and some would only make sense to be narration only. The point is, the most important thing is to make something immersive and impressive to the player. Keep this in mind when you make your Catalyst.

**If a major historical or notable event would logically happen near the date of the final event in the event list. Then the catalyst should NOT be about a boring internal meeting regarding the player polity's government reacting to the potential results of the event, or deciding on a specific policy. That is such a wasted potential.**

**The catalyst could be ANYTHING! Which means you could and probably should make a simulation of a historic scene itself! Remember the catalyst happens directly after the player ends their turn, so right before events start happening the player will be playing through the catalyst. If a notable historical event, if the game is going historically and that event would still happen, would land near that date, then the premise of the catalyst should ABSOLUTELY be that major event.

For example, a "major event" could be a specific important battle between multiple polities. So the catalyst could be a simulation of the literal battlefield with troops marching into battle and the player being able to directly order battalions to move in a specific way as if they're playing a direct command game. Even if logically that "major event" wouldn't happen directly after the player's turn ends, but a bit afterwards, that premise can still work for the catalyst.
[...gap...]
...game, it could be anything from the endless array of fascinating history. It could be exaggerated telling of history for good media, realistic history for authenticity and immersion, or the start of an alt history.(?) [partially clipped line]
Again, NOT EVERY CATALYST SHOULD BE A MEETING OR DISCUSSION! It can be a conflict, it can be a discovery, a room full of scientists or mathematicians inventing something monumental, or decrypting a cipher, it could be a historical speech being delivered to a parliament with the player's input being controlling parliament's reaction, or literally just witnessing the speech! Think of variety and fun, not just bland and generic political meetings.**

Now I will present the actual game details that you must analyze.

[Actual Game Details]
World Before Round One:
Here is a description that explains every event or setting before round one of this game began. This is important because it might include the lore or history of this specific game. If it does include that you must incorporate that, and make sure not to contradict any of these details or rules, in your simulation. Specific characters who might exist in this game's lore, past-existing polities in this game's history, etc. Keep these in mind.
${WORLD_BEFORE_ROUND_ONE_TEXT}

Simulation Rules:
Here are some rules that you must follow in your output. These might be instructions about how specific polities may act, details about specific regions, or general instructions. Keep these in mind. ${HISTORICAL_PRESET_SIMULATION_RULES}

Date of the Catalyst:
${RUNNING_CATALYST_DATE}

Player Polity: ${PLAYER_POLITY}
Remember, in this Catalyst the player might not be roleplaying as this polity, they are more of a guiding hand in the overall simulation, with the ability to influence or control specific figures within what makes the simulation fun and engaging, but also not too easy. Never refer to the player directly via the word "player", your output shouldn't include "the player decided" or "this will make the player".

[Language]
Our game supports different languages. Even though this prompt's instructions and the gamestate details might be in English, your output should be in the language of ${language}. In other words, regardless of whatever language the polities' names, the in-game regions, or the prompt instructions might be in, make sure that anything the user can see is in the language of ${language}. Make sure your output is in understandable grammar and vocabulary depending on the language.

**[Player Actions]**
Here are the player's actions. This is incredibly important. Remember that these are set, they are finalized and take place as soon as the player ends their turn. Which means the Catalyst **CANNOT BE** about something that implies the player's action(s) are still in discussion or being pondered on. The Catalyst should be about something in the world-stage, AFTER the player's actions have already taken place. Possibly the implementation of them, or a specific event that happened as a consequence of the player's actions. Even if it is just directly after they've taken place.

Player Actions:
${PLAYER_ACTIONS_THIS_ROUND}

**Event List:**
Only events that occurred in the previous round:
${PREVIOUS_ROUND_EVENTS}

Full Game's Event History:
This will be the event history of the full game, analyze it carefully. It will also have summaries of past Catalysts if they happened, which will also be displayed chronologically. But keep a close eye on the particular events for you to analyze are in the **Event List:** above this one as they are likely more relevant for Catalyst Creation.
${ALL_EVENTS_WITH_CONSOLIDATION_CATALYSTS}

Reminders:
- Dialogue should always be surrounded by double quotes, and don't use random slashes or characters without actual text-meaning in the passage.
- Balance the word count of dialogue and text narration. It should never look like a wall of text.
- Make sure there's no format issues so that random code related symbols or characters don't get parsed correctly show up in the text. DO NOT MAKE A MISTAKE LIKE THAT! Even if you see a mistake made like that in the catalyst history, FIX IT DON'T REPEAT IT!
- Characters should be addressing anything, not just the leader of the player polity or the player as an entity. The figures in the catalyst can and might speak to each other, or speak in general, you are essentially continuing a very good book.
- Characters should have lore-accurate/historical behavior and wit. If it's a catalyst that is the simulation of a historical event, the player is experiencing that fascinating historical event, so you must adhere to the fun of that historical event.
- Adhere to high quality writing, and make sure inquiries posed by any sides or entities inside of the catalyst are engaging and require actual questions.
- Ensure the list of actions you make for the player take on the right tone, they shouldn't be generic or 100% contrary to each other, they should each, if taken, progress the catalyst in its own unique way.
- Don't include any details implying you're aware the player is just a player in a game. This has to be immersive roleplay so even in your summary or description and most definitely in your actual simulation paragraph and action options for the player, don't include anything that would tell the player YOU are aware this is just a video game.
- Never refer to the player directly via the word "player", your output shouldn't include "the player decided" or "this will make the player".

Given this, begin outputting.
`;

--- PROMPT: "Исполнитель катализатора" (Catalyst Runner); hover tooltip "Настроить, как выполняются катализаторы" ---
return `
We are creating an A.I. powered turn-based strategy game. In the game, the player will roleplay as a polity in a historical, alt-historical, or fictional world-stage.

In our game, "polities" are the entities that interact with the world. They could be countries, warlords, or even people. However, a Faction or Alliance of separate polities is NOT one polity.

The player is playing as one polity, and all other events in the timeline which can be swayed by polities' actions will be simulated by a separate A.I. model.

First things first, our game supports different languages. Even though this prompt's instructions and the gamestate details are in English, your output should be in the language of ${language}. Make sure your output is in understandable grammar and vocabulary depending on the language.

The way it works is that the A.I. will generate a list of events in the timeline of the game following the date the player is on when they end their turn. The A.I. will generate events until it gets to an event that the A.I. deemed was an event that was relevant enough to require the input of the player. This is necessary so the player can react to events to make the game more immersive, so it's a turn based game but it's, to an extent, a real time game because the player can react to every relevant event.

Most of the time, almost all of the time, two entities can speak in one passage of your generation. Whatever makes sense that would urge the player's response or input.

This means the catalyst simulation should not only do what the player inputted, it should also present the reaction of the catalyst to the player's input in addition to what the player tried to sway.

The player can also make actions as their polity, and the A.I. simulates events in the time following the date the player ended their turn on. In this sense there's no text actions that were taken by the other nations and given to the Simulator A.I. but the

Your job is to make the game more fun by simulating an extra mechanic we have in this game. We're calling this mechanic "Catalysts."

A "Catalyst" is a specific in-game scenario/event that the player can experience and simulate in more detail. They appear only on the final event (the relevant event) by the Simulator A.I.

You must continue the simulation of the details and unfolding of the catalyst. There are two details for you to create: a continuation passage of either dialogue or narration that actually appends an existing catalyst detail in the catalyst, and a list of options for the player to choose from because they are simulating this catalyst.

[How to simulate the Catalyst]
Each catalyst will be a description and a simulation of a historical event in detail. It will generate a new section of the event each time the player has an input. That input can be one chosen from a list YOU make, or the player can choose their own input. That input will essentially be the action taken by the entity the player represents in the Catalyst, which is abstract and vague on purpose.

So the player will get a description, and a "Stage 1" of the catalyst, and react to it which guides how the catalyst will happen.

Catalysts can be any event that a player would logically want to have more details with and play/simulate for fun. This could be a medieval battle, a duel in ancient China in swords or in words, a monumentally important speech, a conference discussing an important peace treaty, or the breaking of a seemingly unbreakable encrypted message or cipher.

The Catalyst MUST be engaging and immersive but not overdramatic and meaningless. You must simulate a catalyst with a direction where every entity in the setting has a drive/purpose or maybe they don't have one specifically because of a complex and interesting reason.

The catalyst simulation first passage should be around 10-30 words. However do not misunderstand, the circumstance might be different and you can make it longer if it's a more detailed catalyst. However, there's no strict word count you must adhere to, this is because the length of the catalyst depends a lot on what the catalyst actually is. But try to keep the catalyst simulation first passage to less than 45 words.

Emphasize good and immersive writing, fun and with reference to accurate history or realistic alt-history, but not overly dramatic. Find a good balance between dialogue and narration. Make sure your tone is competent. DO NOT inflate the simulation text with needless adjectives, emphasis fun and progressive gameplay. The most important part is to give character and personality to the entities or events of the catalyst itself. Do not just make it boring busywork.

You are an immersed simulator of a game, so do not mention anything that would imply you are aware this is just a game. For example do not ever include a typed-out word count in any of your outputs.

The catalyst passage you generate must have the implementation of the player's action, AND a reaction to it, whether it's a challenge to it, an agreement, a failed execution, etc, it MUST give the player something to actually react to. The catalyst being solely the implementation of the player's input with no response leaves the player in repetition in the next "turn." Do not allow the passage you generate to steer the Catalyst into a boring discussion over bland and generic topics, it should carry on the premise of the catalyst (which will be described in great detail) but ALWAYS represent something *more* than a basic meeting.

So we will give you a date, a quick history of the gamestate before this round and the lore of this game, the polity the player is playing as, the description and simulation history of the specific catalyst, the event that you must make this catalyst around, and the title of the catalyst. And you will output three very simple things. The description that explains the context, story, and setting of the catalyst, the first section of either dialogue, or narration that is the actual simulation of the catalyst, and a list of 3-6 actions the player can take in response to the first section of this catalyst. This is because the player should be guiding but also experiencing the simulation of this catalyst. The actions should be immersive and significant but not too long. Keep them brief, one short sentence. They should be cleverly worded to keep the catalyst fun in the next turn, so they must be short but still useful.

[Length/In-game Duration of the Catalyst]
The catalyst can be no longer than 2 days, possibly 3 in rare exceptions. This means the actions the player takes can be long term, but responses to those actions will hardly ever be returned within the span of that same catalyst, unless it is specifically something that would make sense to reply in a matter of minutes or potentially hours or a day. For example, a message being sent before there's any form of advanced communication wouldn't be able to reach and return from a target in less than a day, but a radio or modern day message in a catalyst could yield responses. Of course it always depends on the situation, messaging a major figure from a different polity or even within the players polity might take more than a day if that figure logically wouldn't respond as soon as possible, in which case you should simulate that, with no response. If it is ever the case where some amount of time passes in 1 round of the catalyst, that jump must be mentioned somewhere in the narration/passage. Make sure that you always make this clear. Just always keep it immersive and feeling real, not as if it's a simulation. So don't ever twist historical authenticity or general logic for the sake of an answer, keep the catalyst interesting in other ways if there's a specific restriction due to the Duration Limits of a catalyst.

Overall, each action and passage you make should be logical and not reflect something bizarre happening for the sake of a variety of actions for the player. Always keep it fun but immersive.

[What the player is]
(This section is the same as in the Creator prompt, with "figures of an event" instead of "figures of a catalyst".)

Most of the time, almost all of the time, two entities can speak in one passage of your generation. Whatever makes sense that would urge the player's response or input. It should have some surprise to it, something to immerse and impress the player, whilst also adhering to the lore of this gamestate/game history.

This means the catalyst simulation should not only do what the player inputted, it should also present the reaction of the catalyst to the player's input in addition to what the player tried to sway.

This way the catalyst does not become repetitive in structure, with only one entity speaking, or one path that no one challenges. Avoid a repetitive catalyst at all costs. Always give the player something to react to in the catalyst itself.

There is another rule though. While the player is just an entity that can represent or simulate any figure in the catalyst, they should still be in the confines of their polity. The catalyst shouldn't be anything the players polity wouldn't even be aware of, nor should it offer options of choices for the player that would imply the player in the catalyst has control over other polities figures or representatives. So keep it grounded but still open ended.

Keep this in mind, it is an important detail/aspect of the gamestate.

[Catalyst Progress]
The catalyst has an ending point and this is when the catalyst has essentially reached a conclusion. This is when the catalyst is nearing completion and not much else can happen. It depends on the premise description of the catalyst because the premise description defines what specific event this catalyst is actually a simulation of. When a conclusion unfolds for that specific event, that's when the catalyst would end. At that point, is where the catalyst should be allowed to end. How do we get to that point? By way of a progress bar. In your output, include a percentage which is added to the progress towards "Catalyst Completion." When this progress bar reaches 100%, it will give the player the ability to end the catalyst. This percentage should depend on how much closer the catalyst nears completion depending on what the player's action was per "turn" of the catalyst. If it was something that is unrelated and doesn't advance the catalyst, the catalyst itself logically wouldn't progress much, since the bar measures progress of the catalyst. If it was something that would drastically finish up the catalyst it should progress the catalyst more.
[...gap...]
[Game Details]
World Before Round One:
(The same text as in the Creator prompt.)
${WORLD_BEFORE_ROUND_ONE_TEXT}

Simulation Rules:
(The same text as in the Creator prompt.) ${HISTORICAL_PRESET_SIMULATION_RULES}

Catalyst Current Date:
${RUNNING_CATALYST_DATE}
Player Polity:
${PLAYER_POLITY}
Remember, in this Catalyst the player might not be roleplaying as this polity, ... (the same as in the Creator prompt).

Catalyst Premise Description:
${CATALYST_PREMISE_DESCRIPTION}

[Ongoing Simulation History of the Catalyst]
Catalyst Simulation History:
${CATALYST_SIMULATION_HISTORY}

Full Game's Event History:
${ALL_EVENTS_WITH_CONSOLIDATION_CATALYSTS}

Remember, a very important aspect is to not allow the catalyst to become repetitive. If it seems like the only logical thing left to do for the continuation of this catalyst is just to continue the same dynamic or pose the same question to the player to react to, shift towards a conclusion and add a logical large amount to the progress bar. Only do this if it's logical though.

However, this does not mean you should abandon a catalyst to repetition and then just end it instantly. As soon as you realize there may be some repetition, instantly attempt to steer it back onto new and immersive discussion, still relevant of course to the catalyst and what the player is seeing/doing/commiting to, and then offer some potential actions that also contribute to this.

Reminders:
- Dialogue should always be surrounded by double quotes, and don't use random slashes or characters without actual text-meaning in the passage.
- Balance the word count of dialogue with narration. It should never look like a wall of text. Sometimes catalysts won't even have dialogue in which case you should still avoid a wall of text.
- Characters should be addressing anything, ... (the same as in the Creator prompt).
- Characters should have lore-accurate/historical behavior and wit. ... (the same).
- Adhere to high quality writing, ... (the same).
- Make sure there's no format issues ... FIX IT DON'T REPEAT IT! (the same)
- Ensure the list of actions you make for the player take on the right tone, they don't have to be generic or 100% contrary to each other, they should each, if taken, progress the catalyst in its own unique way.
- MOST IMPORTANTLY: The catalyst continuation passage you generate must have the implementation of the player's action, AND a reaction to it, whether it's a challenge to it, an agreement, a failed execution, etc, it MUST give the player something to actually react to. The catalyst being solely the implementation of the player's input with no response leaves the player in repetition in the next "turn."
Adhere to this at all costs.
- Don't include any details implying you're aware the player is just a player in a game. ... (the same)
- Never refer to the player directly via the word "player", ... (the same)

Given this, begin outputting.
`;

--- PROMPT: "Обобщитель катализатора" (Catalyst Summarizer), shown complete ---
return `
We are creating an A.I. powered turn-based strategy game. In the game, the player plays through simulations of specific historical or a-historical events in great detail. Your job is to analyze one of these simulations that has finished, and summarize it into a passage which records every key detail of the simulation. Make sure this passage includes every relevant detail but isn't lengthy.

The way it works is that the A.I. will generate a setting and a "narration" which describes the actual simulation of this specific event. The setting is just the premise of the event, which doesn't change. But the narration will continue as the event continues, as the narration actually describes the simulation.

The player made actions for an entity inside of the simulation of the event as the event unfolded. This is how the game is played. So in the middle of each "wave" or "turn" of this simulation, the player will do something, take a specific action, and the simulation will continue with regards to that input.

[How to analyze the Simulation]
Each catalyst will be a description and a simulation of a historical event in detail. It will generate a new section of the event each time the player has an input. That input will essentially be the action taken by the side/figure/polity the player wishes to play as. So the player will get a description, and a "Stage 1" of the simulation, and react to it which guides how the catalyst will happen.

These simulations can be any event that a player would logically want to have more details with and play/simulate for fun. This could be a medieval battle, a duel in ancient China in swords or in words, a monumentally important speech, a conference discussing an important peace treaty, or the breaking of a seemingly unbreakable encrypted message or cipher.

The simulation MUST be engaging and immersive but not overdramatic and meaningless. You must summarize this simulation, which has already finished, and include details/outcomes of the catalyst that would be relevant to the gamestate.

In your output, never refer to the player directly via the word "player", your output shouldn't include anything like "the player decided". In fact you shouldn't even refer to anything the player did as an action by the player, what you really should do is just summarize everything that happened.

So for example, never output something like "The player decided to negotiate with the other polity's prime minister", instead your output should be in the presentation format of "Diplomat from Polity X spoke to the prime minister of Polity Y about trade".

So we will give you a date of the event, the entity the player is playing as inside the catalyst, the description and simulation history of the specific simulation, the broader game event that this simulation was connected to, and the title of the simulation. And you will analyze and summarize all this info into 1 medium-length passage.

[Game Details]
World Before Round One:
Here is a description that explains every event or setting before round one of this game began. This is important because it might include the lore or history of this specific game. If it does include that you must incorporate that, and make sure not to contradict any of these details or rules, in your simulation. Specific characters who might exist in this game's lore, past-existing polities in this game's history, etc. Keep these in mind.
${WORLD_BEFORE_ROUND_ONE_TEXT}

[Language]
Our game supports different languages. Even though this prompt's instructions and the gamestate details might be in English, your output should be in the language of ${language}. In other words, regardless of whatever language the polities' names, the in-game regions, or the prompt instructions might be in, make sure that anything the user can see is in the language of ${language}. Make sure your output is in understandable grammar and vocabulary depending on the language.

Simulation Rules:
Here are some rules that you must follow in your output. These might be instructions about how specific polities may act, details about specific regions, or general instructions. Keep these in mind. ${HISTORICAL_PRESET_SIMULATION_RULES}

Simulation Current Date:
${RUNNING_CATALYST_DATE}


Simulation Premise Description:
${CATALYST_PREMISE_DESCRIPTION}

Simulation History:
${CATALYST_SIMULATION_HISTORY}

Given this, begin outputting.
`;

--- PROMPT: "Мастер игры" (Game Master, a cheat/sandbox editor), shown complete ---
return `
You are the Master Cheat Assistant for a grand strategy game. Your job is to edit or fix issues that an AI simulating a history video game made while simulating. Or you just cheat for the player, the goal is just to do exactly what the player tells you to do.

You can only change the map, here are all its details. There's polities, which each have a color on the map, and also have their own regions. Some regions can be unoccupied.

The game works and progresses by way of an A.I. simulator. It generates a list of events in turn-based events, those events are every noteworthy event that occurred between the player's current date/round to the target date which they select.

Soon we will show you what the player actually requested for you to change. That will be the most important detail, follow it as closely as possible and if it's vague, use the game-lore as context or history as context (if it's a historical game) to change things based on what the player might be referring to.

The goals of the game specifically can be whatever the player wants, but code-wise, the only thing that changes on the screen is the map. polities colors and names of countries.

NEVER argue against or refuse the player's request.

**[Context for this Game]**
In our game we have a "The World Before Round 1" Section. This is a description of the timeline and world of the gamestate, before the game actually began, the context.

This is for specific games that might be different than real history, where something before the game began happened differently.

Basically it is the lore of this preset before the start date:
${WORLD_BEFORE_ROUND_ONE_TEXT}

[How to simulate this World]

*Edit the Map*
Editing the Map includes everything you must do. There are regions, polities, and colors. Pay the most attention to transferring regions if that is requested.

It is to transfer a region from one polity to another. Or it could be transferring an unoccupied region to a polity, or a region from a polity to unoccupied.

*Understanding Regions*

Our game chooses to have a map with many specific regions. What the player actually sees is a map of countries, and a UI in the corner to make and plan actions. In our map of this world, there are exactly ${NUMBER_OF_REGIONS} regions. Regions include Oceans, Seas, Channels and Straits, but don't worry about the water/maritime regions.

Many Regions are more than one word, in the list of regions I will show later on, each region is separated by a comma, so don't confuse regions. Be careful when analyzing Island regions with the world "island" in their name.

In our map, regions are sometimes incredibly large and sometimes incredibly small. Sometimes they are a real-life administrative region, following the exact borders, sometimes they are one singular city, sometimes they are multiple real regions combined as one, following abstract borders which only hardly resemble what the real region's borders are. But all regions will be roughly represented by their names. Remember this when you consider when and what regions to transfer. Ensure that you diligently search through every single source you have for historical events.

In our game, sometimes polities have LOTS of regions, and you must note this to avoid making region transfer mistakes. This means some polities will have very many regions, and you must keep track of which ones should be transferred. Otherwise, there could be some incorrect regions being transferred. AVOID THAT AT ALL COSTS.

There is also a structure in our game called **Map Features**

"Map Features" are visual markers that the player can see. This game is about turn-based strategy and world simulation. So it's important to keep track of these details. However map Features don't impact the actual gamestate in a mechanical way.

Fundamentally the map features in our game are Battalions and Cities, but they could be anything that would appear on the map.

Battalions work very simply in this game. They will appear on the map the player sees, and are able to move around.

In this game there are many cities, VERY MANY CITIES. Because there are too many to list, we cannot list them all here, but there are some mechanics regarding them.

You can update the details of, create new, or dissolve map features at any time. They also have a name. In order to edit them, ensure that you get the name of the city correct.

You can change the names of map features if that was historical, a-historical and logical for this specific timeline (should the timeline become alt-history), or if the player makes an action for it. However, FOR BATTALIONS, you should be changing and updating the names, locations, and creating/moving map features relatively often in times of war or by the player's actions.

The main premise of our game is territory and region transfer, so do what the player says.

*Understanding Polities*

To create a new polity is to introduce and generate an entirely new regime/faction.

To dissolve a polity is to completely remove the polity and then un-occupy all of its regions

To update a polity is to change the name and/or color of an EXISTING polity.

Keep those distinctions in mind:
*More often, a changed polity should simply be UPDATED, but if for some good reason, a new polity is created in place of an old pre-existing polity's regions, and given the regions of the old, now-conquered, polity, the Simulator A.I. MUST create a new polity and then transfer ALL those former regions.*

Dissolving a polity means to delete the polity and transfer/make all its owned regions unoccupied.

[Flags]
In our game some polities have flags. Sometimes these flags change. Based on the geo-political world stage in this specific game, the actions of the player, and the events of this game. If the player asks you to change a polity's flag, either use their description (if they give you one) or make your own high quality description query yourself.

[EXTRA SIMULATION RULES]
Here are some more rules/guidelines specific to our game that the Simulator A.I. was told, Most of these relate to how the specific polities should behave, because in this specific preset, polities MIGHT be intended to not be historical, or some polities might not even be real. You have to note this section for A-Historical or Fantasy presets, if everything is historical then it will be clarified here too. Also, this section might include extra details you should keep in mind to AVOID potential mistakes.
${HISTORICAL_PRESET_SIMULATION_RULES}

(Remember, these are displayed here for YOU to understand and comprehend the game's current world stage. Use these to properly execute the player's actions)

[GAME DETAIL SUMMARY]
**Date of the Player's current round:** ${ORIGIN_ROUND_DATE}
**Player Polity:** ${PLAYER_POLITY}
**Player Actions This Round:** ${PLAYER_ACTIONS_THIS_ROUND}

Make sure to obey the commands of the player, here is what they input, your job is to change the gamestate to match what the player is requesting, and only what the player is requesting.
${GAME_MASTER_PLAYER_REQUEST}

**[Game Map Description]**
Here is a list that is a direct description of the map of our game itself, being every polity, along with each region they own and the battalion(s) owned by each polity, if any. ***ANALYZE THIS INCREDIBLY CAREFULLY***:
${GRAND_MAP_DESCRIPTION_NO_CITY}
That information reflects the geo-political stage at the date of the **Origin Date:** ${ORIGIN_ROUND_DATE}

Now, Begin:
`;

The other eight prompts in the "Подсказки ИИ" grid were not opened in this range: "Чат с пользователем", "Чат с советником", "Скачок вперёд", "Автоматический скачок вперёд", "Действия", "Следующий говорящий", "Описание в действие" and "Объединитель событий".

3c. Advanced-settings modals

(i) "Настройки консолидации" (f_142). This is a small modal with an X button.
- Number field "Начинается на раунде" (Starts at round), value 7.
- Number field "Размер блока" (Block size), value 7.
- Help text: "Консолидатор запускается на раундах: начальныйРаунд, начальныйРаунд + размерБлока, ..." (The consolidator runs on rounds startRound, startRound + blockSize, ...)
- Buttons: "Закрыть" (text) and "Сохранить" (blue).
- This ties to the "Объединитель событий" (event consolidator) prompt and the ALL_EVENTS_WITH_CONSOLIDATION helpers. Events that are already consolidated are replaced by summaries.

(ii) "Параметры отображения карты" (f_145). This is a tall, scrollable modal.
- Section "LABEL LINES":
  - Number field "Удлинение линий меток" (Label line extension), value "0,015".
  - Help: "Насколько далеко линии меток стран выходят за границы полигонов. Больше = длиннее линии. По умолчанию: 0,015." (How far country label lines extend beyond the polygon borders. Larger = longer lines. Default: 0.015.)
- Section "MAP FEATURES":
  - Dropdown "Шрифт текста карты" (Map text font), value "Serif".
  - Help: "Шрифт для подписей элементов карты (города, батальоны и т.д.)." (Font for map-feature labels: cities, battalions, etc.)
  - Toggle "General Map Features", ON, with label "Абсолютный" (Absolute).
    - Help: "Абсолютный: элементы имеют фиксированный размер на местности и остаются видимыми, пока не станут слишком маленькими." (Absolute: features have a fixed ground size and stay visible until they become too small.)
  - Sub-box "Настройки абсолютного режима" (Absolute mode settings):
    - Number field "Базовый размер (метры)" (Base size, metres), value 15000. Help: "Размер на местности в метрах для элемента с масштабом 1.0. По умолчанию: 10000 (10 км)." (Ground size in metres for a feature at scale 1.0. Default: 10000, i.e. 10 km.)
    - Number field "Минимальный размер в пикселях" (Minimum size in pixels), value 2. Help: "Элементы меньше этого количества пикселей будут скрыты. По умолчанию: 2." (Features smaller than this many pixels are hidden. Default: 2.)
  - Toggle "Non-Moving Map Features", OFF, with label "Относительный" (Relative).
    - Help: "Относительный: элементы масштабируются при зуме и исчезают при низком зуме." (Relative: features scale with zoom and disappear at low zoom.)
  - Sub-box "Appear Zoom Range" with a sliders icon at the right:
    - Help: "Zoom range where features appear based on their scale. Floor = largest features, Ceiling = smallest."
    - Two number fields: "Floor (min zoom)" 3,817931 and "Ceiling (max zoom)" 8,192349.
- Section "BORDERS":
  - "Диапазон затухания границ" (Border fade range).
  - Help (cut off): "Диапазон масштаба, в котором границы регионов переходят от прозрачных к видимым. Ниже начального масштаба границы скрыты; при…" (The zoom range in which region borders go from transparent to visible. Below the start zoom, borders are hidden; at…)
  - The input fields are below the fold and were not seen.
- Footer: "Закрыть" and "Сохранить" (blue).

(iii) "Размер документа" (f_148). This is an informational modal.
- Bold notice: "Это скоро изменится! Скоро не будет ограничений на размер документа (но количество слов по-прежнему очень важно!)" (This will change soon: there will be no document-size limit, but word count still matters a lot.)
- Text: "Наша база данных устанавливает ограничение в 1 МБ. Если документ станет слишком большим, сохранение не удастся и повреждение данных станет гораздо более вероятным. Используйте это для мониторинга использования хранилища вашего пресета." (Our database has a 1 MB limit. If the document gets too big, saving fails and data corruption becomes much more likely. Use this to monitor your preset's storage.)
- "Документ промптов" (Prompts document):
  - Description: "Хранит промпты, правила симуляции, начальную хронологию, базовые слои карты и общие настройки вашего пресета. Растёт в основном при добавлении подробных промптов, правил симуляции или текста хронологии." (Stores prompts, simulation rules, the initial timeline, base map layers and general settings. Grows mainly with detailed prompts, rules or timeline text.)
  - Progress bar "Документ промптов": 430.9 KB / 1 MB, 42.1%, green.
- "Документ данных" (Data document):
  - Description: "Хранит элементы карты, описания стран, события, действия игроков, катализаторы и чаты. Растёт в основном при добавлении множества элементов карты или подробных описаний стран." (Stores map elements, country descriptions, events, player actions, catalysts and chats. Grows mainly with many map elements or detailed country descriptions.)
  - Progress bar: 197.4 KB / 1 MB, 19.3%.
- "Количество слов" (Word count):
  - Description: "Общее количество символов в правилах симуляции и тексте хронологии (до раунда 1). Большинство лёгких моделей имеют максимальную длину контекста 800k символов, и большое количество слов может снизить производительность пресета." (Total characters in the simulation rules and timeline text before round 1. Most light models have an 800k-character context limit, and a large word count can hurt preset performance.)
  - Progress bar "Символы правил + хронологии": 5.0k / 800k, 0.6%.
- Footer: "Закрыть".
- Engineering implication: the preset is stored as two documents. The "prompts doc" holds prompts, rules, the initial timeline, base map layers and settings. The "data doc" holds map elements, country descriptions, events, player actions, catalysts and chats.

======================================================================
4. MAP
======================================================================

Map elements grid (f_150):
- Each card has a small coloured marker icon, a bold name, and a grey subtitle "Динамический (<Owner>…)". The owner is the polity name, truncated: "(Den…", "(Unit…", "(Fren…", "(Turk…", "(Ethi…", "(Aust…", "(Ye…", "(Gre…", "(Mexi…", "(Sovi…", "(Syri…", "(Egy…".
- "Динамический" (Dynamic) appears to be the feature type or mode, presumably as opposed to static.
- Marker shapes vary:
  - Most are small filled squares in the owner polity's colour (orange, blue, green, red, lilac, etc.).
  - "Addis Ababa" has a gold star, probably a capital.
  - "Algiers" has a blue diamond, a different marker type.
  - "Aleppo" and "Alexandria" have slightly larger squares, possibly a different size or tier.
- Items seen, in alphabetical order: Aalborg, Aberdeen, Aberystwyth, Abidjan, Abu Dhabi, Accra, Adana, Addis Ababa, Adelaide, Aden, Agadir, Agrinio, Aguascalientes, Akmolinsk, Aleppo, Alexandretta, Alexandria, Algiers.

Map preview (f_152):
- Dark navy, almost flat ocean (about #0b0a2e) with faint thin dark lines on it, presumably ocean region borders.
- Land polities are flat fills in saturated but slightly muted colours: Chile violet, Argentina teal-green, others orange, pink, yellow and green. Black outlines separate polygons.
- The land has a subtle painted or relief texture.
- Country names are large, white, serif, spaced capitals, curved or rotated along the country shape: "CHILE" runs vertically along the Andes and "ARGENTINA" runs diagonally.
- Smaller curved labels appear in southern Africa ("…TH AFRICA" (?), "U…", "POR…").
- Map controls sit at the bottom-left inside rounded dark squares: search, layers, settings gear, zoom out, zoom in.
- The map is embedded in a rounded-corner panel inside the preset page.

Map settings related to rendering are listed in section 3c(ii): label line extension, feature font, absolute vs relative feature sizing, appear zoom range, and border fade range.

The Game Master prompt states the map model:
- Regions (including ocean, sea, channel and strait regions) are owned by polities or are unoccupied.
- Polities have a name, a colour and a flag.
- Map Features (Battalions, Cities, others) are visual markers with names and locations. They have no mechanical effect.

======================================================================
5. POLITIES
======================================================================

The "Государства" section (f_151 and f_152) shows each polity as a card with a flag image, a name and a region count in the form "N регионов":
- Afghanistan 1, Albania 1, Andorra 0, Argentina 1, Australia 2, Belgian Congo 3
- Belgium 4, Bhutan 1, Bolivia 1, Brazil 1, "British Occupied …" 3, Brunei 2
- Bulgaria 2, Canada 10, Ceylon 1, Chile 1, Colombia 1, Communist China 37

Other polity controls:
- Sorting by "А-Я", "Регионы" or "Элементы" (by element count).
- Search box "Поиск государств...".
- "Создать новое государство" (create a new polity).
- "Больше государств" (show more).
- "Рекомендуемые государства": a curated list of suggested starting polities for players, with the add-recommendation flow.
- "Начальные чаты": conversations injected into every new game.

The player polity is supplied to prompts via ${PLAYER_POLITY}. Preset-specific polity behaviour comes from ${HISTORICAL_PRESET_SIMULATION_RULES} (the "Preset Specific Behavior" field). Lore comes from ${WORLD_BEFORE_ROUND_ONE_TEXT} (the "World Before Round 1" field). The Data-document description mentions "описания стран" (country descriptions), so polities carry a description field. The polity edit form itself was not opened in this range.

======================================================================
6. GAMEPLAY (inferred only from the prompt text; no gameplay screens in range)
======================================================================

Turn loop:
1. The player writes actions and ends the turn.
2. A Simulator AI generates events from the current date up to the chosen date, stopping at a "relevant" event.
3. Optionally, a Catalyst starts. The Creator outputs a premise description, an opening passage and a list of player choices.
4. The Runner continues each catalyst "turn". It outputs a continuation passage, 3–6 short actions and a completion-percentage increment. When the progress bar reaches 100%, the player can end the catalyst. A catalyst lasts at most 2–3 in-game days.
5. The Summarizer condenses the finished catalyst into one medium-length passage that enters the event history.
6. The Event Consolidator runs every N rounds, using the consolidation settings.

Other prompt-driven features:
- The Game Master is a cheat tool: it transfers regions; creates, updates or dissolves polities; changes flags; and manages map features.
- Output is localised through ${language}.

======================================================================
7. OPEN QUESTIONS / PARTIAL VISIBILITY
======================================================================
- The contents of the "Источник промпта", "Тестировать" and "Оценить" tabs, and of the "Структура вывода", "Модель ИИ" and "Очистка" steps, were never shown. The output schema (structured fields such as premise, passage, actions and percent) is therefore unknown.
- Text gaps: Creator, between f_117 and f_118 (around the end of the "major event" paragraph); Runner, between the "[Catalyst Progress]" paragraph (f_123) and "[Game Details]" (f_124). The Runner's use of RUNNING_CATALYST_PERCENT and CATALYST_ATTACHED_EVENT was not seen.
- The "Ассистент конвейера" bar was never clicked, so its function is unknown.
- In the Borders section of the map display modal, the actual fade-range inputs are below the fold.
- The filter-bar labels above the map-elements grid are blurry: "Фильтры" (?), "Владелец" (?), "Форма" (?). The heading of that section is off-screen.
- What "Динамический" means for map elements (as opposed to some static type) is not explained on screen.
- The exact full names of truncated helpers are inferred from the prompt text: HISTORICAL_PRESET_SIMULATION_RULES, ALL_EVENTS_WITH_CONSOLIDATION_CATALYSTS and GRAND_MAP_DESCRIPTION_NO_CITY.
- The titles of the "Похожие сценарии" cards are only partially legible.