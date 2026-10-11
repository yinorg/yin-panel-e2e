# Сквозные приёмочные тесты Yin-Panel

[English](../../README.md) | [简体中文](../zh-CN/README.md) | [繁體中文](../zh-TW/README.md) | [日本語](../ja-JP/README.md) | [한국어](../ko-KR/README.md) | [Deutsch](../de-DE/README.md) | [Français](../fr-FR/README.md) | [Español](../es-ES/README.md) | [Português (Brasil)](../pt-BR/README.md) | **Русский** | [Bahasa Indonesia](../id-ID/README.md) | [Türkçe](../tr-TR/README.md) | [Polski](../pl-PL/README.md) | [Italiano](../it-IT/README.md) | [Nederlands](../nl-NL/README.md) | [हिन्दी](../hi-IN/README.md) | [ไทย](../th-TH/README.md)

Приёмочные тесты на Playwright для запущенного сервиса Yin-Panel и распакованного расширения браузера. Набор управляет реальными браузерами против приложения Core — и переопределения новой вкладки расширения — поэтому кросс-репозиторные сценарии проверяются сквозным образом: вход и аккаунты, пространства и права, элементы и перенос закладок, система тем и поведение PWA. Отдельный набор на k6 измеряет тот же сервис под нагрузкой.

## Требования

- Node.js с npm
- Браузеры Playwright (`npx playwright install`)
- Запущенный экземпляр Yin-Panel для тестирования, а также его файл окружения из репозитория Core
- Исходный код распакованного расширения для набора тестов расширения
- k6 для сценариев производительности в `perf/`

## Установка

```bash
cd "$YIN_PANEL_E2E_DIR"
npm ci
npx playwright install
```

## Конфигурация

Каждая конфигурация загружает файл окружения, имя которого задано в `YIN_PANEL_ENV_FILE`; по умолчанию это `./.env.local`.

- `YIN_PANEL_URL` — базовый URL запущенного сервиса (набор PWA требует источник HTTPS)
- `YIN_PANEL_EXTENSION_DIR` — исходный код распакованного расширения, загружаемый тестом новой вкладки
- `YIN_PANEL_TEST_USER` и `YIN_PANEL_TEST_PASSWORD`, либо `YIN_PANEL_TEST_TOKEN` — тестовый аккаунт
- `YIN_PANEL_TEST_SPACE_ID` — тестируемое пространство, по умолчанию `1`
- `DISPLAY` — требуется для headed-тестов расширения; в CI используйте `xvfb-run -a`
- `YIN_PANEL_TEST_ADMIN_USER` и `YIN_PANEL_TEST_ADMIN_PASSWORD` — аккаунт администратора, используемый в `npm run provision-member` и наборах темы
- Изолированные наборы темы и визуальных тестов запускают временный экземпляр из `YIN_PANEL_TEST_BINARY`, `YIN_PANEL_TEST_WEB_DIR` и `YIN_PANEL_TEST_LANG_DIR`

Не добавляйте `.env.local` в Git; в нём хранятся учётные данные тестов.

## Быстрый старт

```bash
# при запущенном сервисе Core на http://127.0.0.1:3002 и выкачанном расширении
YIN_PANEL_ENV_FILE='/path/to/Yin-Panel/.env.local' DISPLAY=:0 npm test
```

## Что проверяется

- Вход, истечение сессии и жизненный цикл аккаунта
- Пространства: группы, участники, коды публичного доступа, связанные пространства, права наблюдателя и миграция
- Элементы: создание, редактирование, значки и импорт/экспорт закладок
- Система тем: встроенные представления главной, установка и предпросмотр пакета v2, поверхности Core и визуальные базовые снимки
- Офлайн-поведение PWA и переопределение новой вкладки расширением
- Измерения нагрузки, задержки и ёмкости в `perf/`

## Команды

| Команда | Назначение |
| --- | --- |
| `npm test` | Набор Playwright по умолчанию |
| `npm run test:headed` | Запуск с окном браузера для локальной отладки |
| `npm run test:theme` | Наборы архитектуры темы и пакетов |
| `npm run test:theme:visual` | Визуальные базовые снимки темы |
| `npm run test:pwa` | Набор PWA против источника HTTPS |
| `npm run perf:smoke` / `npm run perf:load` | Дымовые и нагрузочные тесты k6 |
| `npm run perf:sweep` / `npm run perf:matrix` / `npm run perf:summary` | Развёртка ёмкости, матрица смешанной нагрузки и отчёт |
| `npm run provision-member` | Создание или повторное использование обычного тестового участника |

## Документация

- [AGENTS.md](../../AGENTS.md) — размещение тестов, ответственность и правила безопасности данных
- [perf/README.md](../../perf/README.md) — сценарии k6, развёртка ёмкости и оговорки по измерениям
- [tests/theme-package-requirements.md](../../tests/theme-package-requirements.md) — карта соответствия требований к пакету темы и тестов
- Core: [yinorg/Yin-Panel](https://github.com/yinorg/Yin-Panel); расширение: [yinorg/yin-panel-extension](https://github.com/yinorg/yin-panel-extension)
- `scripts/readme-screenshots.mjs` перегенерирует скриншоты README Core из изолированного экземпляра

Артефакты сбоев записываются в `test-results/` и `playwright-report/`, оба каталога остаются вне Git.
