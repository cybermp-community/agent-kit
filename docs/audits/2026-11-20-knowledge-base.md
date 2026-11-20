# Аудит базы знаний CyberMP Agent Kit

Состояние кита на коммите `14865c9`. Сверка с `@cybermp/server-types@3.2.8`, `@cybermp/client-types@2.7.1` и `@cybermp/browser-types@2.0.1`. Игровое поведение требует проверки на конкретных версиях Cyberpunk 2077 и CyberMP.

Основная проблема — агент получает противоречивую информацию из двух инструментов одного кита. Например, `cybermp_get_event` возвращает два числовых ID для `vehicleStreamIn`, а первый результат `cybermp_search_docs` обещает объект `MpVehicle`. Приоритет исправления — устранить это расхождение в выдаче, затем исправлять примеры по темам.

## Одиночная игра как основа аудита

CyberMP работает поверх Cyberpunk 2077. При поиске решения рассматриваем весь набор возможностей одиночной игры: штатные ассеты, записи TweakDB, игровые системы, интерфейсы, анимации и механики. Если в справочнике CyberMP нет готового примера, проверяем, как возможность реализована в базовой игре и как ресурс CyberMP может её использовать или адаптировать.

Для каждой возможности отдельно фиксируем, что присутствует в базовой игре, как это доступно из ресурса и что происходит в сетевой сессии. На применимость могут влиять версия игры, наличие DLC, загрузка архивов и настройки `cybermp_core`. Например, игра содержит ванильный гараж, а параметр `disable_garage` управляет его вызовом в CyberMP. [Работа с REDengine API](https://docs.cyber.mp/reference/client/working-with-game-natives/) · [Доставка файлов](https://docs.cyber.mp/guides/resources/adding-resource-files/) · [Настройки CyberMP](https://docs.cyber.mp/reference/server/configuration/)

## Что проверено

- Все **16 Markdown-справочников**. Извлечено **127 блоков JS/TS**. Каждый скомпилирован отдельно в TypeScript strict с `mp`, объявленным по очереди как `MpClient`, `MpServer` и `MpBrowser`. **76** блоков прошли хотя бы в одной среде. **51** выдал диагностику во всех трёх. Часть блоков намеренно предполагает соседний код или функции приложения, поэтому это очередь проверки самостоятельности примеров, а не 51 дефект. Существенные расхождения ниже привязаны к применимой среде.
- **64 строки** таблиц серверных и клиентских событий сопоставлены с генерируемым индексом. **22** расходятся по аргументам или возвращаемому типу и **2** отсутствуют в соответствующей среде индекса. Переименование аргумента при том же типе не учитывалось.
- **45 записей TweakDB** проверены на дубликаты и наличие следов во внешних списках либо в исходниках Freeroam. Для статусов и транспорта сравнивались точные строки. Применимость объекта, эффекта или записи в CyberMP отсюда не следует.
- **29 сводок CyberMP Docs** привязаны к снимку `909c0c08d7810ad136ab8b0ff2b8e0b4fdc6d569`. Они полезны для навигации по руководствам. У офлайн-корпуса остаются пробелы по разделам Reference, Lua и диагностике совместимости архивных зависимостей.

Источники. [Версии деклараций](../../src/data/type-sources.json) · [Манифест сводок](../../data/upstream-guides.json) · [Документация CyberMP](https://docs.cyber.mp/) · [CyberMP Freeroam](https://github.com/Cyber-MP/CyberMP-Freeroam).

## Исправления с наибольшим эффектом

| Приоритет | Подтверждённое расхождение | Исправление и проверка |
| --- | --- | --- |
| P1 | [Таблицы событий](../../skills/cybermp-dev/references/events.md#3-client-events-catalog-eventson) описывают восемь клиентских stream-событий с объектами. Декларации и `get_event` принимают пару `netID, gameID`. В обеих средах у `resourceStart` и `resourceStop` в таблице лишний аргумент. `playerConnecting` описан как `(tempId: string, ip: string)`, объявление содержит `(tempId: number, name: string)`. `playerQuit` отсутствует в публичной карте; `__coreConfig` отсутствует в серверной карте и описан как внутреннее событие. | Генерировать строки из тех же деклараций, что питают `get_event`. Добавлять вручную только пояснения по жизненному циклу и происхождению ID. Через установленный MCP проверить согласованность двух инструментов для `vehicleStreamIn`, `resourceStart`, `domReady`, `playerConnecting` и отсутствие рекомендации `playerQuit` как публичного события. [Клиентские события](https://docs.cyber.mp/reference/client/api/events/mpeventsmap/) · [Серверные события](https://docs.cyber.mp/reference/server/api/events/mpeventsmap/) |
| P1 | [Сценарии RPC](../../skills/cybermp-dev/references/rpc-flows.md) и [генератор RPC](../../src/engine/rpc-engine.ts#L54) используют `player.name`. В серверном контракте есть `nickname`. Пример рассылки использует `mp.players.all`, декларация предоставляет `toArray()`. В справочнике также есть прикладные функции без реализации внутри шаблона. | Проверять каждый готовый RPC-пример в среде его отправителя и получателя. Полные примеры и прикладные фрагменты обозначать явно. [Серверная работа с событиями](https://docs.cyber.mp/guides/server/events/) · [Типы CyberMP](https://github.com/Cyber-MP/CyberMP-Types) |
| P1 | [Справочник ресурсов](../../skills/cybermp-dev/references/resource-structure.md#2-root-server-configuration-servertoml) называет весь список `core.files` обязательным. Публичный справочник описывает список как опциональный набор файлов из `cybermp_core/files/`. `ui_page` отсутствует в опубликованной схеме, которая разрешает дополнительные свойства, поэтому одной схемы недостаточно для вывода о поведении ключа. `./assets/**/*.xl` обещает рекурсивную маску без подтверждения. | Опираться на документированные пути `cef_url` или `mp.cef.setUrl` в dev-режиме. Разделить обязательность блока `[core]` и требования конкретного режима к файлам. Указывать точные пути или проверенные маски конкретного каталога. [Настройка сервера](https://docs.cyber.mp/reference/server/configuration/) · [Схема ресурса](https://schemas.cyber.mp/resource/schema.json) · [Доставка файлов](https://docs.cyber.mp/guides/resources/adding-resource-files/) |
| P1 | [Справочник native API](../../skills/cybermp-dev/references/game-natives.md#1-engine-lifecycle--script-hooking) обещает готовность локального игрока в `onceGameLoaded` и немедленное выполнение обычного `observeAfter`. Документация отделяет загрузку мира от появления puppet и описывает обычный observer как вызов из очереди. Такие условия важны для спавна, UI, дверей и очистки при перезапуске. | Добавить матрицу стадий и связать её с рецептами. Проверять наличие puppet, время регистрации и повторную инициализацию отдельно. Типы подтверждают сигнатуру, а порядок проверяется на версии клиента. [Жизненный цикл](https://docs.cyber.mp/guides/client/lifecycle/) · [Наблюдение методов](https://docs.cyber.mp/guides/client/observes/) |
| P1 | [Каталог TweakDB](../../src/data/tweakdb.json) выдаёт два спорных ID Porsche и Hellhound рядом с подтверждаемыми записями. Поиск не показывает источник и тип записи для каждого результата. Шесть названий `Workspot.*` также выдаются как TweakDB ID, хотя приведённый пример workspot использует игровое устройство и актёра. | Ввести источник, версию, тип записи и проверенный способ применения на уровне каждой строки. Спорные совпадения оставить со статусом кандидата. Для workspots проверить фактический тип ресурса или записи перед дальнейшей выдачей. [WolvenKit Tweak Browser](https://wiki.redmodding.org/wolvenkit/wolvenkit-app/editor/tweak-browser) |
| P2 | [Поиск документов](../../src/engine/docs-engine.ts) автовыбирает первый пример, если в коде нет совпадения с запросом. Источник и статус назначены целому документу, хотя в одном разделе могут быть и подтверждённый контракт, и предположение. | Привязать среду, статус и ограничения к разделу или примеру. Снабдить фрагменты зависимостями. При конфликте с декларациями показывать причину, прежде чем выдавать код. |

## Пригодность каждого справочника

| Справочник | Полезное содержание | Что следует подтвердить или исправить |
| --- | --- | --- |
| [Events](../../skills/cybermp-dev/references/events.md) | Три канала событий и тематическая навигация | Устранить 24 расхождения в таблицах. CEF `domReady` и `loadingFailed` регистрируются на клиентском `onCef`. Не фиксировать дальность стриминга в общей сигнатуре. |
| [RPC flows](../../skills/cybermp-dev/references/rpc-flows.md) | Схема Server ↔ Client ↔ CEF | Исправить `name` и `all`. В CEF примере чтение `.value` требует уточнения типа DOM-элемента. Транспорт и схема прикладного payload требуют отдельных проверок. |
| [Resource structure](../../skills/cybermp-dev/references/resource-structure.md) | Размещение ресурсов и явные точки входа | Сверить `core.files`, `ui_page`, маски и настройки сборки. При проверке архива отдельно подтвердить доставку, загрузку и появление ассета. |
| [Game natives](../../skills/cybermp-dev/references/game-natives.md) | Карта подсистем REDengine и примеры их вызовов | Исправить тайминг observer и lifecycle. Переменная с явным типом `gamemappinsMappinSystem` не даёт вызвать `TrackMappin` в примере. Декларация CyberMP добавляет его к `gameMappinSystem`, а Freeroam использует этот вызов. Нужна проверка типа, предоставляемого мостом для целевой версии. Для `GetSlotTransform` нужен специализированный компонент, а `FindComponentByName` возвращает общий `entIComponent`. |
| [Server mechanics](../../skills/cybermp-dev/references/server-mechanics.md) | Серверная геометрия, авторитет состояния и управление сущностями | Правила safezone сверяются с Freeroam, где первый аргумент `damage` используется как ID атакующего, а жертва берётся из `data.victimId`. Проверка формы зоны подходит для обычных тестов, отмена урона и владение требуют игрового прогона. В примере exports синхронная аннотация должна учитывать `Promise<boolean>`. |
| [Cameras, input and CEF](../../skills/cybermp-dev/references/cameras-input-cef.md) | Жизненный цикл CEF, ввод, локальная камера | Spectator использует неподдерживаемый конструктор `mp.game.TweakDBID`. Пример Discord импортирует `MpPlayer` из пакета клиента, где такой экспорт отсутствует. Провести поэтапную проверку камеры и отдельно проверить фокус и очистку CEF. |
| [Player mechanics](../../skills/cybermp-dev/references/player-mechanics.md) | Пути поиска телепортации, экипировки и статусов | Отделить самостоятельные примеры от зависимостей `closeAllMenus`, `spawnPlayer` и других помощников. Некоторые передаваемые native типы структурно несовместимы в текущих декларациях. Каталоги предметов требуют проверки ID и версии отдельно. |
| [Objects and streaming](../../skills/cybermp-dev/references/object-spawning-and-streaming.md) | Выбор локального и серверного спавна | Сигнатуру и тип хеша брать из соответствующей среды. Перечень depot paths считать кандидатами. Время жизни, видимость ассета и сетевое поведение проверять отдельно. |
| [Doors and devices](../../skills/cybermp-dev/references/doors-and-devices.md) | Разделение сущности двери и persistent state | Передача нескольких конкретных классов действий в API с параметром `ScriptableDeviceAction` не проходит по текущим декларациям. Это может быть проблемой генерации типов. Ответ клиента и сетевое владение нуждаются в отдельной проверке. |
| [Animations and workspots](../../skills/cybermp-dev/references/animations-and-workspots.md) | Модель «устройство плюс актёр» и выход из workspot | `PlayInDeviceSimple` подтверждается декларацией. Обёртка получает системный объект при загрузке модуля и предполагает готовность мира. Пример репликации зависит от `findDeviceEntityById`, которой в примере нет. Требуется воспроизводимый сценарий для выбора устройства и позднего подключения клиента. |
| [Vehicle physics](../../skills/cybermp-dev/references/vehicles-physics.md) | Сценарии посадки, ремонта, камеры и измерения скорости | В примере телеметрии `GetRpmValue` и `GetCurrentGear` не объявлены на `vehicleBaseObject`. Не публиковать точные обещания по синхронизации физики без пары клиентов и испытания смены владельца. |
| [Vehicle tuning](../../skills/cybermp-dev/references/vehicles-tuning-combat.md) | Входы для исследования дверей, световых режимов и CrystalCoat | Примеры вызывают `GetVehicleControllerPS` на переменной типа `vehicleBaseObject`. Метод есть у других классов в установленных декларациях. Нужна проверка фактического объекта или более точного типа. |
| [World interaction](../../skills/cybermp-dev/references/recipes/world-interaction.md) | Отдельные паттерны INK-подсказки, точечной метки и аппаратного ввода | Менеджер зависит от помощников из соседних разделов. Собрать один проверяемый файл с жизненным циклом. Состояние одиночного устройства и синхронизацию проверять в игре. |
| [INK HUD and minimap](../../skills/cybermp-dev/references/ui-ink-and-minimap.md) | Выбор между точкой, виджетом, большой картой и серверной зоной | Описание отделяет установленные факты от наблюдений Gangwar. Тайминг и преобразование координат проверяются на конкретном HUD. |
| [Minimap diagnostic](../../skills/cybermp-dev/references/recipes/minimap-zones.md) | Изолированные проверки одного виджета и одной перегрузки цвета | TypeScript пример компилируется. Появление, удаление, видимый цвет и мировая привязка ещё не проверены в клиенте. |
| [Archive prop](../../skills/cybermp-dev/references/recipes/archive-prop.md) | Сквозная процедура от собственной геометрии до вызова CyberMP API | Генерация GLB и типы примера проверены. WolvenKit импорт, загрузка пакета, appearance и видимый спавн ещё не подтверждены. |

Для серверного damage полезно опираться на [обработчик Freeroam](https://github.com/Cyber-MP/CyberMP-Freeroam/blob/main/resources/freeroam/server/src/modules/greenzones/greenzones.service.ts). Для различия локального handle и сетевого ID есть [официальное руководство CyberMP](https://docs.cyber.mp/guides/client/network-ids/).

Выбирая путь исправления, сначала обновить выдачу для строгих контрактов, которые можно проверять автоматически. Затем приводить самостоятельные примеры к компилируемому виду. Проверки движка приоритизировать по реально используемым сценариям: lifecycle и UI, объекты и стриминг, игрок и инвентарь, двери и workspots, транспорт. Офлайн расширение полезнее всего начать с официальных страниц по нативному мосту и ресурсам, затем добавить версии и небольшой воспроизводимый пример там, где документация оставляет вопрос открытым.

## Правки по итогам аудита

- Таблицы событий и поиск MCP теперь используют общие данные из деклараций. Примеры RPC и стартового ресурса приведены к установленным типам. Для части каталога TweakDB добавлены ссылки на проверяемые упоминания и отмечены спорные записи.
- Локальная камера теперь проверяет появление компонента с ограниченным ожиданием. Для spectator дан поиск компонента по сетевому ID. Noclip и переход в интерьер описаны как сценарии проверки в игре. CEF и локальные объекты показывают очистку при остановке ресурса. Для `mp.objects.create` указан серверный `mp.hashes.resref`.
- Для игрового прогона остаются смена и восстановление камеры, повторная загрузка CEF и освобождение ввода, коллизия в интерьере, а также загрузка архивного пропа на двух клиентах. Список `.ent` остаётся перечнем кандидатов для проверки по версии игры.

## Проверка TweakDB

Идентификаторы сопоставлены с двумя публичными фильтрованными списками ModUtils и локальной копией Freeroam. Файлы ModUtils не фиксируют версию игры, поэтому совпадение подтверждает упоминание записи, а отсутствие в фильтрованном списке оставляет вопрос открытым. В строках транспорта Freeroam сравнивался суффикс под ключом `model`; полный префикс подтверждается внешним списком. В локальной копии Freeroam отсутствуют Git-метаданные. Столбец ниже показывает степень подтверждения на момент сверки.

| Категория | Всего | Со ссылкой на упоминание | Без подтверждения |
| --- | ---: | ---: | ---: |
| Статусы | 11 | 10 | 1 |
| Транспорт | 9 | 7 | 2 |
| Оружие | 8 | 1 | 7 |
| Quickhacks | 6 | 0 | 6 |
| Workspots | 6 | 0 | 6 |
| Одежда | 5 | 0 | 5 |
| **Всего** | **45** | **18** | **27** |

### Подтверждённые упоминания

- `BaseStatusEffect.` — `Burning`, `Electrocuted`, `Poisoned`, `Bleeding`, `CyberwareMalfunction`, `Blind`, `Stun`, `MemoryWipe`, `Knockdown`, `Defeated`. [Список статусов](https://github.com/SkyrimLL/ModUtils/blob/main/TweakDBExtract/data/tweakdb-BaseStatusEffect.txt)
- `Vehicle.` — `v_sport1_quadra_turbo_r_player`, `v_sport2_mizutani_shion_nomad_player`, `v_sport1_rayfield_caliburn_player`, `v_standard25_thorton_colby_pickup_player`, `v_sport1_herrera_outlaw_player`, `v_sportbike1_yaiba_kusanagi_player`, `v_sportbike2_arch_player`. [Список транспорта](https://github.com/SkyrimLL/ModUtils/blob/main/TweakDBExtract/data/tweakdb-Vehicles.txt) · [Каталог Freeroam](https://github.com/Cyber-MP/CyberMP-Freeroam/blob/main/resources/freeroam/server/src/modules/vehicles-spawner/vehicles.repository.ts)
- `Items.Preset_Silverhand_3516` используется в коде Freeroam. [Режим PvP Freeroam](https://github.com/Cyber-MP/CyberMP-Freeroam/blob/main/resources/freeroam/server/src/modules/game-modes/modes/pvp/index.ts)

### Кандидаты с обнаруженным расхождением

- `Vehicle.v_sport2_porsche_911_turbo_player` отсутствует в сверенной выборке. В ней и в Freeroam есть `Vehicle.v_sport2_porsche_911turbo_player`. [Исходники Freeroam](https://github.com/Cyber-MP/CyberMP-Freeroam/blob/main/resources/freeroam/server/src/modules/vehicles-spawner/vehicles.repository.ts) · [Список транспорта](https://github.com/SkyrimLL/ModUtils/blob/main/TweakDBExtract/data/tweakdb-Vehicles.txt)
- `Vehicle.v_utility4_militech_hellhound_player` отсутствует в сверенной выборке. В ней есть кандидат `Vehicle.v_standard3_militech_hellhound_player`, его нужно проверить на целевой версии. [Список транспорта](https://github.com/SkyrimLL/ModUtils/blob/main/TweakDBExtract/data/tweakdb-Vehicles.txt)
- `BaseStatusEffect.Emp` отсутствует в сверенной выборке. Вхождение `BaseStatusEffect.EmpSFX` не подтверждает эквивалентность эффекта. [Список статусов](https://github.com/SkyrimLL/ModUtils/blob/main/TweakDBExtract/data/tweakdb-BaseStatusEffect.txt)

Контрольные суммы сверенных источников SHA-256:

- ModUtils BaseStatusEffect — `019b879e351fc422dd19e69aacc2a2ff1ccb73b58a178288669a50f8b7c797a3`.
- ModUtils Vehicles — `d84e15a556931e7f745848daf23767cd84868e2bdd8e66360a0763b691686145`.
- Публичная схема ресурса — `2344f7c4ee2ebc23afdea1211168b7fd6cbbaaf9e0313ac6d8d72006f88eae0d`.

Для следующей сверки нужна выгрузка из WolvenKit Tweak Browser или REDmod для конкретной версии игры. Сопоставлять точный ID, фактический тип записи и необходимые DLC или моды. Совместимость с CyberMP подтверждать в ресурсе отдельно. [Работа с TweakDB](https://wiki.redmodding.org/cyberpunk-2077-modding/for-mod-creators-theory/tweaks/tweaks/browsing-the-tweak-database)
