# Yin-Panel end-to-end acceptatietests

[English](../../README.md) | [简体中文](../zh-CN/README.md) | [繁體中文](../zh-TW/README.md) | [日本語](../ja-JP/README.md) | [한국어](../ko-KR/README.md) | [Deutsch](../de-DE/README.md) | [Français](../fr-FR/README.md) | [Español](../es-ES/README.md) | [Português (Brasil)](../pt-BR/README.md) | [Русский](../ru-RU/README.md) | [Bahasa Indonesia](../id-ID/README.md) | [Türkçe](../tr-TR/README.md) | [Polski](../pl-PL/README.md) | [Italiano](../it-IT/README.md) | **Nederlands** | [हिन्दी](../hi-IN/README.md) | [ไทย](../th-TH/README.md)

Playwright-acceptatietests voor een draaiende Yin-Panel-service en de uitgepakte browserextensie. De suite stuurt echte browsers aan tegen de Core-applicatie — en de nieuwe-tab-overschrijving van de extensie —, zodat cross-repository-workflows end-to-end worden geverifieerd: aanmelding en accounts, ruimten en rechten, items en bladwijzeroverdracht, het themasysteem en PWA-gedrag. Een aparte k6-suite meet dezelfde service onder belasting.

## Vereisten

- Node.js met npm
- Playwright-browsers (`npx playwright install`)
- Een draaiende Yin-Panel-instantie om tegen te testen, plus het bijbehorende omgevingsbestand uit de Core-repository
- De uitgepakte extensiebron, voor de extensiesuite
- k6 voor de prestatiescripts onder `perf/`

## Installatie

```bash
cd "$YIN_PANEL_E2E_DIR"
npm ci
npx playwright install
```

## Configuratie

Elke configuratie laadt het omgevingsbestand dat met `YIN_PANEL_ENV_FILE` wordt aangewezen en dat standaard `./.env.local` is.

- `YIN_PANEL_URL` — basis-URL van de draaiende service (de PWA-suite vereist een HTTPS-origin)
- `YIN_PANEL_EXTENSION_DIR` — uitgepakte extensiebron die door de nieuwe-tab-test wordt geladen
- `YIN_PANEL_TEST_USER` en `YIN_PANEL_TEST_PASSWORD`, of `YIN_PANEL_TEST_TOKEN` — testaccount
- `YIN_PANEL_TEST_SPACE_ID` — te testen ruimte, standaard `1`
- `DISPLAY` — vereist door de headed extensietests; gebruik `xvfb-run -a` in CI
- `YIN_PANEL_TEST_ADMIN_USER` en `YIN_PANEL_TEST_ADMIN_PASSWORD` — beheerdersaccount dat door `npm run provision-member` en de themasuites wordt gebruikt
- De geïsoleerde thema- en visuele suites starten een tijdelijke instantie vanuit `YIN_PANEL_TEST_BINARY`, `YIN_PANEL_TEST_WEB_DIR` en `YIN_PANEL_TEST_LANG_DIR`

Houd `.env.local` buiten versiebeheer; het bevat testreferenties.

## Snel starten

```bash
# met de Core-service actief op http://127.0.0.1:3002 en de extensie uitgecheckt
YIN_PANEL_ENV_FILE='/path/to/Yin-Panel/.env.local' DISPLAY=:0 npm test
```

## Wat het dekt

- Aanmelding, sessieverloop en de levenscyclus van accounts
- Ruimten: groepen, leden, openbare toegangscodes, gekoppelde ruimten, kijkerrechten en migratie
- Items: aanmaken, bewerken, pictogrammen en importeren/exporteren van bladwijzers
- Themasysteem: ingebouwde startpaginaweergaven, installatie en voorvertoning van pakket v2, Core-oppervlakken en visuele basislijnen
- Offlinegedrag van de PWA en de nieuwe-tab-overschrijving van de extensie
- Metingen van belasting, latentie en capaciteit onder `perf/`

## Opdrachten

| Command | Doel |
| --- | --- |
| `npm test` | Standaard Playwright-suite |
| `npm run test:headed` | Uitvoering met zichtbare browser voor lokaal debuggen |
| `npm run test:theme` | Thema-architectuur en pakketsuites |
| `npm run test:theme:visual` | Visuele basislijnen van thema's |
| `npm run test:pwa` | PWA-suite, tegen een HTTPS-origin |
| `npm run perf:smoke` / `npm run perf:load` | k6 smoke- en loadtests |
| `npm run perf:sweep` / `npm run perf:matrix` / `npm run perf:summary` | Capaciteits-sweep, matrix met gemengde workloads en rapport |
| `npm run provision-member` | Het gewone testlid aanmaken of hergebruiken |

## Documentatie

- [AGENTS.md](../../AGENTS.md) — regels voor testplaatsing, eigenaarschap en gegevensveiligheid
- [perf/README.md](../../perf/README.md) — k6-scripts, capaciteits-sweep en kanttekeningen bij de metingen
- [tests/theme-package-requirements.md](../../tests/theme-package-requirements.md) — toewijzing van themapakket-eisen aan tests
- Core: [yinorg/Yin-Panel](https://github.com/yinorg/Yin-Panel); extensie: [yinorg/yin-panel-extension](https://github.com/yinorg/yin-panel-extension)
- `scripts/readme-screenshots.mjs` regenereert de schermafbeeldingen van de Core-README vanuit een geïsoleerde instantie

Mislukkingsartefacten worden naar `test-results/` en `playwright-report/` geschreven; beide blijven buiten versiebeheer.
