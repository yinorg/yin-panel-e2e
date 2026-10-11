# Test di accettazione end-to-end di Yin-Panel

[English](../../README.md) | [简体中文](../zh-CN/README.md) | [繁體中文](../zh-TW/README.md) | [日本語](../ja-JP/README.md) | [한국어](../ko-KR/README.md) | [Deutsch](../de-DE/README.md) | [Français](../fr-FR/README.md) | [Español](../es-ES/README.md) | [Português (Brasil)](../pt-BR/README.md) | [Русский](../ru-RU/README.md) | [Bahasa Indonesia](../id-ID/README.md) | [Türkçe](../tr-TR/README.md) | [Polski](../pl-PL/README.md) | **Italiano** | [Nederlands](../nl-NL/README.md) | [हिन्दी](../hi-IN/README.md) | [ไทย](../th-TH/README.md)

Test di accettazione Playwright per un servizio Yin-Panel in esecuzione e per l'estensione non pacchettizzata del browser. La suite guida browser reali contro l'applicazione Core — e la sostituzione della nuova scheda dell'estensione — così i flussi di lavoro tra repository vengono verificati end-to-end: accesso e account, spazi e autorizzazioni, elementi e trasferimento dei segnalibri, il sistema di temi e il comportamento PWA. Una suite k6 separata misura lo stesso servizio sotto carico.

## Requisiti

- Node.js con npm
- Browser Playwright (`npx playwright install`)
- Un'istanza Yin-Panel in esecuzione su cui eseguire i test, più il suo file di ambiente dal repository Core
- Il codice sorgente dell'estensione non pacchettizzata, per la suite dell'estensione
- k6 per gli script di prestazioni in `perf/`

## Installazione

```bash
cd "$YIN_PANEL_E2E_DIR"
npm ci
npx playwright install
```

## Configurazione

Ogni configurazione carica il file di ambiente indicato da `YIN_PANEL_ENV_FILE`, che per impostazione predefinita è `./.env.local`.

- `YIN_PANEL_URL` — URL di base del servizio in esecuzione (la suite PWA richiede un'origine HTTPS)
- `YIN_PANEL_EXTENSION_DIR` — codice sorgente dell'estensione non pacchettizzata caricata dal test della nuova scheda
- `YIN_PANEL_TEST_USER` e `YIN_PANEL_TEST_PASSWORD`, oppure `YIN_PANEL_TEST_TOKEN` — account di test
- `YIN_PANEL_TEST_SPACE_ID` — spazio sottoposto a test, predefinito `1`
- `DISPLAY` — richiesto dai test dell'estensione con interfaccia visibile; usa `xvfb-run -a` in CI
- `YIN_PANEL_TEST_ADMIN_USER` e `YIN_PANEL_TEST_ADMIN_PASSWORD` — account amministratore usato da `npm run provision-member` e dalle suite dei temi
- Le suite isolate dei temi e dei test visivi avviano un'istanza temporanea da `YIN_PANEL_TEST_BINARY`, `YIN_PANEL_TEST_WEB_DIR` e `YIN_PANEL_TEST_LANG_DIR`

Mantieni `.env.local` non tracciato; contiene le credenziali di test.

## Avvio rapido

```bash
# con il servizio Core in esecuzione su http://127.0.0.1:3002 e l'estensione disponibile in locale
YIN_PANEL_ENV_FILE='/path/to/Yin-Panel/.env.local' DISPLAY=:0 npm test
```

## Cosa copre

- Accesso, scadenza della sessione e ciclo di vita dell'account
- Spazi: gruppi, membri, codici di accesso pubblico, spazi abbinati, autorizzazioni dei visualizzatori e migrazione
- Elementi: creazione, modifica, icone e importazione/esportazione dei segnalibri
- Sistema di temi: viste home integrate, installazione e anteprima dei pacchetti v2, superfici Core e baseline visive
- Comportamento offline della PWA e sostituzione della nuova scheda dell'estensione
- Misurazioni di carico, latenza e capacità in `perf/`

## Comandi

| Comando | Scopo |
| --- | --- |
| `npm test` | Suite Playwright predefinita |
| `npm run test:headed` | Esecuzione con interfaccia visibile per il debug locale |
| `npm run test:theme` | Suite per l'architettura dei temi e i pacchetti |
| `npm run test:theme:visual` | Baseline visive dei temi |
| `npm run test:pwa` | Suite PWA, su un'origine HTTPS |
| `npm run perf:smoke` / `npm run perf:load` | Test smoke e di carico k6 |
| `npm run perf:sweep` / `npm run perf:matrix` / `npm run perf:summary` | Sweep di capacità, matrice di carichi misti e report |
| `npm run provision-member` | Crea o riutilizza il membro di test regolare |

## Documentazione

- [AGENTS.md](../../AGENTS.md) — regole su collocazione dei test, proprietà e sicurezza dei dati
- [perf/README.md](../../perf/README.md) — script k6, sweep di capacità e avvertenze sulle misurazioni
- [tests/theme-package-requirements.md](../../tests/theme-package-requirements.md) — mappa requisito-test del pacchetto di temi
- Core: [yinorg/Yin-Panel](https://github.com/yinorg/Yin-Panel); estensione: [yinorg/yin-panel-extension](https://github.com/yinorg/yin-panel-extension)
- `scripts/readme-screenshots.mjs` rigenera gli screenshot della README del Core da un'istanza isolata

Gli artefatti dei test falliti vengono scritti in `test-results/` e `playwright-report/`, entrambi non tracciati.
