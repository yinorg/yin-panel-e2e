# Yin-Panel End-to-End-Abnahmetests

[English](../../README.md) | [简体中文](../zh-CN/README.md) | [繁體中文](../zh-TW/README.md) | [日本語](../ja-JP/README.md) | [한국어](../ko-KR/README.md) | **Deutsch** | [Français](../fr-FR/README.md) | [Español](../es-ES/README.md) | [Português (Brasil)](../pt-BR/README.md) | [Русский](../ru-RU/README.md) | [Bahasa Indonesia](../id-ID/README.md) | [Türkçe](../tr-TR/README.md) | [Polski](../pl-PL/README.md) | [Italiano](../it-IT/README.md) | [Nederlands](../nl-NL/README.md) | [हिन्दी](../hi-IN/README.md) | [ไทย](../th-TH/README.md)

Playwright-Abnahmetests für einen laufenden Yin-Panel-Dienst und die entpackte Browser-Erweiterung. Die Suite steuert echte Browser gegen die Core-Anwendung — und die Neuer-Tab-Überschreibung der Erweiterung —, sodass repositoryübergreifende Workflows durchgängig verifiziert werden: Anmeldung und Konten, Bereiche und Berechtigungen, Einträge und Lesezeichen-Übertragung, das Theme-System und das PWA-Verhalten. Eine separate k6-Suite misst denselben Dienst unter Last.

## Anforderungen

- Node.js mit npm
- Playwright-Browser (`npx playwright install`)
- Eine laufende Yin-Panel-Instanz zum Testen sowie deren Umgebungsdatei aus dem Core-Repository
- Der Quellcode der entpackten Erweiterung, für die Erweiterungs-Suite
- k6 für die Performance-Skripte unter `perf/`

## Installation

```bash
cd "$YIN_PANEL_E2E_DIR"
npm ci
npx playwright install
```

## Konfiguration

Jede Konfiguration lädt die durch `YIN_PANEL_ENV_FILE` benannte Umgebungsdatei, die standardmäßig `./.env.local` ist.

- `YIN_PANEL_URL` — Basis-URL des laufenden Dienstes (die PWA-Suite erfordert einen HTTPS-Origin)
- `YIN_PANEL_EXTENSION_DIR` — Quellcode der entpackten Erweiterung, die vom Neuer-Tab-Test geladen wird
- `YIN_PANEL_TEST_USER` und `YIN_PANEL_TEST_PASSWORD` oder `YIN_PANEL_TEST_TOKEN` — Testkonto
- `YIN_PANEL_TEST_SPACE_ID` — zu testender Bereich, Standard `1`
- `DISPLAY` — wird von den sichtbaren (headed) Erweiterungstests benötigt; verwenden Sie `xvfb-run -a` in CI
- `YIN_PANEL_TEST_ADMIN_USER` und `YIN_PANEL_TEST_ADMIN_PASSWORD` — Administratorkonto, das von `npm run provision-member` und den Theme-Suiten verwendet wird
- Die isolierten Theme- und Visual-Suiten starten eine Wegwerf-Instanz aus `YIN_PANEL_TEST_BINARY`, `YIN_PANEL_TEST_WEB_DIR` und `YIN_PANEL_TEST_LANG_DIR`

Behalten Sie `.env.local` unversioniert; die Datei enthält die Test-Zugangsdaten.

## Schnellstart

```bash
# mit dem laufenden Core-Dienst auf http://127.0.0.1:3002 und ausgecheckter Erweiterung
YIN_PANEL_ENV_FILE='/path/to/Yin-Panel/.env.local' DISPLAY=:0 npm test
```

## Testumfang

- Anmeldung, Sitzungsablauf und Kontolebenszyklus
- Bereiche: Gruppen, Mitglieder, öffentliche Zugriffscodes, gekoppelte Bereiche, Betrachterberechtigungen und Migration
- Einträge: Erstellung, Bearbeitung, Symbole und Lesezeichen-Import/-Export
- Theme-System: integrierte Startseitenansichten, Paket-v2-Installation und -Vorschau, Core-Oberflächen und visuelle Baselines
- PWA-Offline-Verhalten und die Neuer-Tab-Überschreibung der Erweiterung
- Last-, Latenz- und Kapazitätsmessungen unter `perf/`

## Befehle

| Befehl | Zweck |
| --- | --- |
| `npm test` | Standard-Playwright-Suite |
| `npm run test:headed` | Sichtbarer Lauf für lokales Debugging |
| `npm run test:theme` | Theme-Architektur- und Paket-Suiten |
| `npm run test:theme:visual` | Visuelle Theme-Baselines |
| `npm run test:pwa` | PWA-Suite, gegen einen HTTPS-Origin |
| `npm run perf:smoke` / `npm run perf:load` | k6-Smoke- und -Lasttests |
| `npm run perf:sweep` / `npm run perf:matrix` / `npm run perf:summary` | Kapazitäts-Sweep, Matrix gemischter Workloads und Bericht |
| `npm run provision-member` | Reguläres Testmitglied anlegen oder wiederverwenden |

## Dokumentation

- [AGENTS.md](../../AGENTS.md) — Regeln zu Testablage, Zuständigkeit und Datensicherheit
- [perf/README.md](../../perf/README.md) — k6-Skripte, Kapazitäts-Sweep und Messhinweise
- [tests/theme-package-requirements.md](../../tests/theme-package-requirements.md) — Zuordnung der Theme-Paketanforderungen zu Tests
- Core: [yinorg/Yin-Panel](https://github.com/yinorg/Yin-Panel); Erweiterung: [yinorg/yin-panel-extension](https://github.com/yinorg/yin-panel-extension)
- `scripts/readme-screenshots.mjs` erzeugt die Screenshots der Core-README aus einer isolierten Instanz neu

Fehlerartefakte werden nach `test-results/` und `playwright-report/` geschrieben; beide bleiben unversioniert.
