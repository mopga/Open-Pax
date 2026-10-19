# Pax Historia frames f_001–f_038: preset page and map editor

I read all 38 frames, plus upscaled crops of the toolbar, map, tooltips and status bar. These frames show the preset browse page, then the owner's view (which doubles as the editor) of the preset "ColdWar NoMore. RU." You see the hero, the three prompt sections and the "Карта регионов" map editor with its tool tooltips. There is no gameplay in this range, and no map tool is actually used: only hovers.

## 1. Per-frame log

- **f_001–f_003 (identical):** Home/browse page with the "Пресеты" tab active, scrolled down. The cursor is on the "Alternate XX Centry (ru-based)" card. The browser status bar shows the hover link `www.paxhistoria.co/presets/A1tlt2WKBbGkgLmWgDjZ?versionID=2`.
- **f_004:** Loading screen. A black page with a centered white wireframe globe inside a thin dark circular ring (spinner). The status bar shows `www.paxhistoria.co/presets/m7bHKMftUDs3flpRRNfg?versionID=3`. The opened preset is ColdWar NoMore. RU.
- **f_005:** Preset page, hero at top: full-width B/W collage cover with "1950 A COLD WAR" artwork. Title, author, stats, action buttons, the green "Играть сейчас" button, then the "Об этом сценарии" section starts.
- **f_006:** Scrolled about 6px. The cursor moves over the hero.
- **f_007:** Scrolled about 380px. "Об этом сценарии", "Начальная временная линия" and "Правила симуляции" are visible. The hero is partly hidden under the top nav.
- **f_008–f_009:** Tiny scroll. The cursor goes near the date chip, then to the left margin.
- **f_010:** Scrolled further. The hero buttons slide under the top bar, and more of the rules text is visible.
- **f_011–f_013:** Hover on the ⓘ of "Начальная временная линия", which shows a tooltip.
- **f_014:** Hover on the ⓘ of "Об этом сценарии", which shows a tooltip.
- **f_015:** Scrolled. The "Карта регионов" header and the top of the map toolbar appear.
- **f_016–f_019:** Hover on the ⓘ of "Правила симуляции", which shows a tooltip. The map preview top is visible. The floating link at bottom-right changes from "Об этом сценарии" to "Начальная временная линия".
- **f_020–f_027:** The user scrolls inside the rules text box (it has its own internal scroll). The page itself does not move.
- **f_028:** The text box is at the end of the rules. The page is scrolled slightly.
- **f_029–f_030:** Page scrolled. The map (Atlantic/Europe/Africa) is largely visible. The "Карта регионов" header is in a greyed hover state; the chevron shows "›" in f_029 and "⌄" in f_030. The floating bottom-right link is now "Правила симуляции".
- **f_031:** Hover on the "Заполнить" tool, which shows a tooltip. A previous tooltip for "Изменить" is fading out.
- **f_032:** Hover on "Топология", which shows a tooltip.
- **f_033:** Hover just left of the toolbar, which shows the tooltip "Vertical toolbar".
- **f_034–f_035:** Small scroll. Hover on the leftmost toolbar button, tooltip "Vertical toolbar".
- **f_036:** Hover on "Выбор", which shows a tooltip.
- **f_037:** Hover on "Мульти", which shows a tooltip.
- **f_038:** Hover on "Кисть", which shows a tooltip.

## 2. Screens and navigation

**Global top bar** (black, thin, on every page):

- Left: globe logo plus "Pax Historia" in a bold display font.
- Center tabs, each with an icon:
  - "Игры" (gamepad icon)
  - "Пресеты" (play-triangle icon; the active tab is a purple/violet pill)
  - "Ассеты" (icon)
  - "Сообщество" (people icon)
- Right:
  - A square grey icon button (gift/shop?)
  - A pill with a gold coin and the balance "$3.264"
  - A bell (notifications)
  - A round blue avatar with "M" and a purple ring

**Browse page (Пресеты tab), f_001:**

- **Partial card at top:** "A Life in Witch-Haunted Arkham ...". Subtitle "\*\*IMPORTANT: USE AUTO-JUMP-FORWARD- THIS GAM...". Stats "1.7K раундов" (left) and "274 стартов" (right).
- **"Ваши сценарии ›" row:** Has a "+ Создать новый сценарий" button and a small trend-arrow icon button on the right. Cards have a 16:9 cover, a bold title and a line "N раундов · M игр":
  - "Alternate XX Centry (ru-based)": 155 раундов · 3 игр
  - "Millennium Dusck v0.1": 37 раундов · 1 игр
  - "ColdWar NoMore. RU.": 32 раундов · 20 игр
  - "Real World 2026 | RUS Перевод (...": 27 раундов · 5 игр
  - "1947: Col...": 18 раундов
  - A "›" arrow scrolls the carousel horizontally.
- **"Лучшие плейлисты ›" row:** Cover with a "≡ N" count badge, title, then "👍 likes • N пресеты":
  - Quality and Playability (2.1K, 21)
  - Live Another Life - RPG Series (1.5K, 72)
  - But You're a Citizen (1.3K, 38)
  - Quality Hoi4 Mods (836, 10)
  - Pax Historia Official Presets (508, 10)
  - Kabanosyy's Ultimate... (321, 63)
  - Hidden... (27?)
- **"Недавние плейлисты ›" row:**
  - Creepypasta and Horror... (2, 6 пресеты)
  - Ibuki Tanuki's RPG Presets (0, 2)
  - The best presets of the moder... (2, 4)
  - But you are a... (3, 12)
  - My Favorite Presets (2, 15)
  - Another Life Citizen Etc (1, 3)
  - The og... (10)
- **"Исторический ›":** A genre row starts, with a trend icon button on the right.
- **URLs:** The preset URL pattern is `/presets/{id}?versionID={n}`, so versions are addressable by number.

**Preset page / editor (owner view), f_005 onward:**

- **Hero:** The full-width cover image is about 520px tall and fades to black at the bottom. A small blue triangular accent sits in the top-left corner. The top-right has a button "Редактировать изображения" (edit images).
- **Title:** "ColdWar NoMore. RU." in large bold white at bottom-left of the hero, with "от Морда" (author) under it.
- **Stats row, separated by vertical bars:**

| Stat | Value |
|---|---|
| "Игр" | 20 |
| "Раундов" | 32 |
| "Копия" | 1 |
| "Избранное" | 1 |

- **Action buttons** (dark rounded outline buttons with icons):
  - "Опубликовать" (upload icon)
  - "Копировать" (copy icon)
  - "Версии" (history icon)
  - "Спонсировать" (rocket/megaphone icon)
  - "Соавторы" (plus-in-circle icon)
  - ♡ favourite (icon only)
  - Clock icon (icon only)
  - ⓘ info (icon only)
- **Big bright-green button** at the hero's right edge: "Играть сейчас".
- **Body:** A single centered column about 655px wide on black.
- **Bottom-left toast:** a dark grey pill that reads "охранено" in every frame. The first letter is cut off by the screen edge, so it is presumably "Сохранено" (autosave indicator).
- **Bottom-right floating link:** an underlined section name followed by a small arrow glyph (cropped, presumably "↑"). It shows the name of the section just scrolled past and probably jumps back to it:
  - f_005–f_015: "Об этом сценарии"
  - f_016–f_028: "Начальная временная линия"
  - f_029 onward: "Правила симуляции"

## 3. Scenario editor structure

Each section has a large bold header, a "⌄" collapse chevron, and an ⓘ icon with a tooltip. Each text field is a rich-text editor with a rounded border and a mini toolbar: undo ↶, redo ↷ (both greyed), then "|", then **B**, *I*, and a 🔗 link button.

### A. "Об этом сценарии" ⌄ ⓘ

- Tooltip: "Описание сценария (не видно ИИ)." This is the public description and is not sent to the AI.
- Two chips (pills) sit above the editor:
  - Calendar icon plus "Начинается 1 января 1960 н. э." (start date, with "н. э." = AD era suffix).
  - "Исторический • Холодная война" (genre • sub-genre or tag).
- Editor content: "Мир на пороге холодной войны. Все начнется с ФРГ и ГДР. Или не начнется. Все зависит от тебя."
- The editor box is about 85px tall.

### B. "Начальная временная линия" ⌄ ⓘ

- Tooltip: "Контекст и ключевые события до даты начала. Помогает игрокам и ИИ понять начальное состояние мира."
- Content: "Все происходило согласно историческим событиям"

### C. "Правила симуляции" ⌄ ⓘ

- Tooltip: "Ограничения и указания для ИИ. Определите разрешённые действия, пределы, цели и особые механики."
- The editor is fixed at about 420px tall with an internal scroll. In f_024 a small grip "‥" at the bottom center looks like a resize handle (uncertain).
- There are no template variables (`{{...}}` or `${...}`) anywhere; it is plain prose with ALL-CAPS headings.
- Full visible text, transcribed verbatim:

```
Этот модуль регулирует моделирование в эпоху холодной войны.
Все правила, приведенные ниже, дополняют основную систему моделирования мира.
ОСНОВНЫЕ ПРИНЦИПЫ
1. Действуйте реалистично, всегда кроме случаев когда игрок не действует по-другому.
2. Придерживайтесь общепринятой геополитической логики.
3. За действиями должны следовать политические, экономические и прочие последствия.
4. Отчеты должны быть предоставлены в виде газетных сводок, с использованием исторических цитат
5. Страны должны действовать на опережение, а не оставаться пассивными.
ПОДРОБНАЯ ИНФОРМАЦИЯ О ВОЙНЕ и СРАЖЕНИЯХ
Все войны должны включать в себя:
- Стратегическую цель
- Оперативное описание
- Ключевые тактические поворотные моменты
- Предполагаемые военные потери
- Предполагаемые потери среди гражданского населения
- Непосредственные геополитические последствия
Бесплодных войн не бывает. Война меняет политику и экономику.
НЕИСТОРИЧЕСКИЙ  РЕЖИМ
Если игрок явно запрашивает "неисторический" путь:
- События могут отличаться. Но ваша первоочередная задача - сделать их более реалистичными и логично вписанными в историческую эпоху
- Результаты действий игрока могут способствовать нетрадиционному успеху.
- Однако: геополитическая логика должна быть учтена
- при этом не нужно ломать физику мира и казуальность геймплея для игрока
ГЛОБАЛЬНАЯ СТРУКТУРА ХОЛОДНОЙ ВОЙНЫ
Мир построен на биполярной напряженности:
 Западный блок во главе с Соединенными Штатами
 Восточный блок во главе с Советским Союзом
Обе сверхдержавы пытаются:
- Расширить влияние в мире
- Подорвать стабильность друг друга
- Конкурировать в идеологии, экономике, логистике, культуре и технологиях
Они почти никогда не стремятся к прямой тотальной войне
ОТЧЕТ О БАЛАНСЕ СИЛ
В конце каждого хода требуется предоставить отчет о том, как дела у страны игрока и к чему привели его действия в формате газетной статьи, со ссылками на исторические цитаты
Отчет на текущий момент должен включать:
- экономическая ситуация
- политическая стабильность
- внешние отношения
- социальная обстановка
ПОЛИТИЧЕСКИЕ ДВИЖЕНИЯ
Политические движения - ЭТО НЕ государства.
Правила:
- НЕ превращайте движения в страны.
- При необходимости создайте отдельное государственное образование, которым они будут управлять.
- Если они не будут управлять, они не смогут контролировать государственный аппарат.
При изменении статуса:
- каким был итог изменения
ВНУТРИПАРТИЙНАЯ ДИНАМИКА
Политические движения должны:
- Опираться на партийные съезды
- Сталкиваться с идеологическими разногласиями
- Сталкиваться с фракционными спорами
- Адаптировать платформу в зависимости от событий
Последствия должны сказаться:
- Единство партии
- Общественная поддержка
- Международное согласование
ИЗБИРАТЕЛЬНАЯ СИСТЕМА (ОБЯЗАТЕЛЬНА ТОЛЬКО В ДЕМОКРАТИЧЕСКИХ СТРАНАХ)
Выборы должны проводиться в соответствии с:
- Конституционным графиком
- Политическими кризисами
- Условиями досрочных выборов
Моделирование должно включать в себя:
1. Процентное соотношение голосов
2. Распределение мест
3. Уровень явки
4. Региональные различия
5. Влияние:
 - Экономический крах
 - Аресты
 - Запугивание
 - Цензура СМИ
 - Иностранное вмешательство
При отсутствии большинства:
- Переговоры о коалиции должны вестись на основе идеологической совместимости.
- Крайние идеологические противники редко образуют коалиции.
- Если арифметика не работает:
 - Правительство меньшинства ИЛИ
 - Досрочные выборы
Если игрок возглавляет партию:
- Они контролируют стратегию ведения переговоров.
НЕЗАКОННЫЕ ПОЛИТИЧЕСКИЕ ДЕЙСТВИЯ
Даже если игрок управляет страной:
- Сопротивление со стороны государства
- Неподчинение военным
Могут иметь место при высокой нестабильности.
Вероятность возрастает при:
- Экономическом кризисе
- Военном поражении
СТИЛЬ ДИПЛОМАТИИ
Дипломатию должны вести лидеры, а не обычные дипломаты.
Отражать исторические личности (например):
 Кеннеди против Хрущева
 Аденауэр против Ульбрихта
 и т.д.
Тон должен отражать:
- Идеологию
-  Эго
- Стратегические интересы
РЕЖИМ РЕПОРТЕРА
- Рассказывайте о событиях в соответствующем периоду журналистском тоне.
- В зависимости от страны:
 - В тоне западных СМИ
 - В тоне советской прессы
Включайте умеренную предвзятость комментариев.
ОБНОВЛЕНИЯ ФУНКЦИЙ КАРТЫ
Изменяйте описания объектов на карте, когда:
- Разрушены города
- Модернизация инфраструктуры
- Военные активы расширяются
- Смена политической символики
- создание новых объектов
Сражения должны заметно влиять на особенности карты.
ЗАКЛЮЧИТЕЛЬНЫЕ ПРИНЦИПЫ
- Напряженность времен холодной войны должна сохраняться до тех пор, пока не будет  преодолена тем или иным образом.
- Страны должны предпринимать реальные инициативы в историческом стиле, или, если игрок сам способствует новым инициативам
- Не допускать застоя и задвоения событий никогда
- Поддерживать причинно-следственную связь.
- Сохранять реализм всегда насколько возможно
- НЕ МЕНЯТЬ ГРАНИЦЫ СТРАН БЕЗ ПОДХОДЯЩИХ СОБЫТИЙ
```

Implied by the rules text (useful for the clone's data model): map objects have editable *descriptions* that the AI updates ("Изменяйте описания объектов на карте"). There is an end-of-turn report in newspaper format.

### D. "Карта регионов" ⌄

No ⓘ is visible. This is an embedded map editor, covered in section 4.

### Versions and publishing

The URL carries `versionID` (3 for this preset), and there are "Версии" and "Опубликовать" buttons. Their dialogs are not opened in these frames.

### Metadata seen

- Title
- Author ("от …")
- Cover image (editable via "Редактировать изображения")
- Start date chip
- Genre chip ("Исторический • Холодная война")
- Description
- Counters: games, rounds, copies, favourites

The chips' edit UI is not shown.

## 4. Map

**Container:** A rounded dark panel inside the page column (about 655px wide, tall). On top is a toolbar with small grey uppercase group captions. Each tool is an icon above a tiny label. Disabled tools are greyed.

| Group | Tool (label) | Tooltip / notes |
|---|---|---|
| (leftmost, no group) | panel icon | "Vertical toolbar" (English, untranslated); toggles the toolbar to vertical |
| ОСНОВНЫЕ ИНСТРУМЕНТЫ | "Выбор" (arrow cursor) | "Выбор — нажмите на регион или объект карты, чтобы открыть его редактор (инструмент по умолчанию)" |
| ОСНОВНЫЕ ИНСТРУМЕНТЫ | "Мульти" (multi-cursor) | "Мульти — выберите несколько регионов или объектов карты" |
| ОСНОВНЫЕ ИНСТРУМЕНТЫ | "Кисть" (paint roller) | "Раскрашивать владение регионами нажатием на карту" (paint region ownership by clicking) |
| ОСНОВНЫЕ ИНСТРУМЕНТЫ | "Рисовать..." (pencil, truncated) | presumably draw a new region polygon; no tooltip seen |
| ОСНОВНЫЕ ИНСТРУМЕНТЫ | "Изменить" (shape/vertex icon) | fading tooltip begins "Изменить форму – тащите …" (edit shape, drag vertices); rest unreadable (?) |
| ОСНОВНЫЕ ИНСТРУМЕНТЫ | "Заполнить" (bucket) | "Заполнить — нажмите на промежуток, чтобы превратить его в регион" (fill a gap into a region) |
| ОБЪЕКТЫ | "Статичный" (building icon) | static map object, e.g. city/structure (?) |
| ОБЪЕКТЫ | "Мобильн..." (person/figure icon, truncated) | mobile object, e.g. unit (?) |
| ОБЪЕКТЫ | "Портал" (greyed/disabled) | |
| ОБЪЕКТЫ | "Туман" (cloud icon) | fog |
| ИЗМЕРЕНИЯ | "Измерение" (stacked-layers icon) | dimension = separate map layer/plane (?) |
| ИЗМЕРЕНИЯ | "Создать" (+) | |
| ИЗМЕРЕНИЯ | "Изменить" (folded-map icon) | |
| ПРОЧЕЕ | "Отменить" (undo) | |
| ПРОЧЕЕ | "Вернуть" (redo, greyed) | |
| ПРОЧЕЕ | "Топология" (scan/focus icon) | "Устранить проблемы топологии — найти и исправить промежутки и перекрытия" |
| (right of ПРОЧЕЕ) | "›" | overflow arrow: more tools hidden to the right |
| (right edge) | ⤢ | fullscreen button |

Inside the map at top-left is a dark rounded square button with a list icon (☰ with bullets). It is probably a region/country list or legend panel; it is not opened in these frames.

### Data model implied

- Regions are polygons, finer than countries; many internal province borders are visible inside each country.
- Ownership is a region→polity assignment, painted with "Кисть". Country fill colour comes from the owner, so colonial possessions share the metropole colour: all of British Africa is orange/gold, and French West/North Africa is blue-teal.
- Topology tools exist for gaps and overlaps, and gaps can be filled into regions.
- Objects come in static and mobile types, plus portal and fog.
- Multiple "dimensions" can exist.

### Visual style

- **Projection and view:** Flat world map, Mercator/equirectangular-like. The view centers on the Atlantic, Europe, Africa and the Middle East, cropping at India and the Americas. No zoom or pan happens in these frames.
- **Ocean:** Very dark navy/indigo (roughly #0b0b35). Very faint thin darker lines cross the sea, possibly sea-region borders.
- **Land fills:** Semi-saturated flat country colours over a visible terrain/relief texture, giving a painterly HOI4/EU-style look (mottled, darker highlands). Examples:
  - USSR: brick red with lighter red-orange toward Central Asia
  - France and its colonies: steel blue / teal
  - UK and its colonies: orange-gold
  - Ireland: green
  - Spain: yellow
  - Italy: lime green
  - Turkey: brown-orange
  - Iran: dark grey-green
  - Saudi Arabia: off-white/beige
  - India: yellow-green
  - Brazil: green
  - Peru: magenta
  - South Africa: lavender/purple
  - Portuguese Africa: dark teal-green
  - Belgian Congo: olive
- **Unowned or neutral land** shows natural terrain: Greenland tan, Iceland white/grey.
- **Borders:** Thin dark (near-black) lines for internal regions and slightly heavier dark lines for country borders. Coastlines have a dark outline.
- **Labels:**
  - Font: serif (Times/Cinzel-like), uppercase, wide letter-spacing, cream/white fill with a dark shadow or outline.
  - Size scales with country area: "SOVI…" is huge, while "POLAND", "TURKEY", "SAUDI ARABIA" are small.
  - Labels curve or rotate along the country's long axis: "UNITED KINGDOM" runs vertically along British East Africa, "FRENCH REPUBLIC" runs diagonally across West Africa, "BRAZIL" is diagonal, "CHILE" is vertical.
  - Names are in English even though the UI is in Russian. Visible: NORWAY (NOR…), SWEDEN, FINLAND (…AND), POLAND, ITALY, SPAIN, TURKEY, IRAN, IRAQ, EGYPT, SAUDI ARABIA, YEMEN, OMAN, PAKISTAN (?), INDIA (IND…), C… (China?), UNITED KINGDOM, FRENCH REPUBLIC, PORTUGAL (twice, Angola and Mozambique), SOUTH AFRICA, ETHIOPIA (?), BRAZIL, PERU, BOLIVIA (?), COLOMBIA (?), CHILE, ARGENTINA, a large "A" in North America (probably the edge of "CANADA" or "AMERICA" (?)).
  - The label set appears to be one label per polity spanning all its regions, including overseas ones.

## 5. Countries / polities

There is no per-country prompt list or player-country selector in this range. Polities are evidently entities that own regions and have a colour and display name. Clicking a region with "Выбор" opens "its editor", which is not shown yet.

## 6. Gameplay

None in these frames. The rules text says a turn ends with a newspaper-style "ОТЧЕТ О БАЛАНСЕ СИЛ" report.

## 7. Open questions for later frames

- What the "Выбор" region/object editor contains (fields for region name, owner, description?).
- What the ☰ list panel inside the map shows.
- What "Рисовать…", "Мобильн…", "Портал", "Туман" and the Измерение tools do.
- What the hidden tools behind the "›" overflow are.
- How the date and genre chips are edited.
- What the Версии, Опубликовать, Соавторы and Спонсировать dialogs contain.
- Whether more sections exist below "Карта регионов" (e.g. polity list, player-country or AI prompts).
- What the clock icon button does.
- The full "Изменить" tooltip text.
- The author name reading "Морда" (?).

Upscaled crops are in `C:/Users/remote77/AppData/Local/Temp/claude/C--Users-remote77--claude-spares-spare-Uv1u1c/b2995ddc-907b-4dbb-a8c8-74eee64fdbea/scratchpad/crops2/`: `toolbar3.png`, `map.png`, `europe.png`, `africa.png`, `actions.png`.
