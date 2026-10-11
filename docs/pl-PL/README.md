# Testy akceptacyjne end-to-end Yin-Panel

[English](../../README.md) | [简体中文](../zh-CN/README.md) | [繁體中文](../zh-TW/README.md) | [日本語](../ja-JP/README.md) | [한국어](../ko-KR/README.md) | [Deutsch](../de-DE/README.md) | [Français](../fr-FR/README.md) | [Español](../es-ES/README.md) | [Português (Brasil)](../pt-BR/README.md) | [Русский](../ru-RU/README.md) | [Bahasa Indonesia](../id-ID/README.md) | [Türkçe](../tr-TR/README.md) | **Polski** | [Italiano](../it-IT/README.md) | [Nederlands](../nl-NL/README.md) | [हिन्दी](../hi-IN/README.md) | [ไทย](../th-TH/README.md)

Testy akceptacyjne Playwright dla działającej usługi Yin-Panel oraz rozpakowanego rozszerzenia przeglądarki. Zestaw steruje prawdziwymi przeglądarkami wobec aplikacji Core — oraz nadpisania nowej karty przez rozszerzenie — dzięki czemu przepływy między repozytoriami są weryfikowane od początku do końca: logowanie i konta, przestrzenie i uprawnienia, elementy i transfer zakładek, system motywów i zachowanie PWA. Oddzielny zestaw k6 mierzy tę samą usługę pod obciążeniem.

## Wymagania

- Node.js z npm
- Przeglądarki Playwright (`npx playwright install`)
- Działająca instancja Yin-Panel do testowania wraz z jej plikiem środowiska z repozytorium Core
- Źródła rozpakowanego rozszerzenia, dla zestawu rozszerzenia
- k6 dla skryptów wydajnościowych w katalogu `perf/`

## Instalacja

```bash
cd "$YIN_PANEL_E2E_DIR"
npm ci
npx playwright install
```

## Konfiguracja

Każda konfiguracja ładuje plik środowiska wskazany przez `YIN_PANEL_ENV_FILE`, który domyślnie ma wartość `./.env.local`.

- `YIN_PANEL_URL` — bazowy URL działającej usługi (zestaw PWA wymaga pochodzenia HTTPS)
- `YIN_PANEL_EXTENSION_DIR` — źródła rozpakowanego rozszerzenia ładowane przez test nowej karty
- `YIN_PANEL_TEST_USER` i `YIN_PANEL_TEST_PASSWORD` lub `YIN_PANEL_TEST_TOKEN` — konto testowe
- `YIN_PANEL_TEST_SPACE_ID` — testowana przestrzeń, domyślnie `1`
- `DISPLAY` — wymagany przez testy rozszerzenia z widoczną przeglądarką; w CI użyj `xvfb-run -a`
- `YIN_PANEL_TEST_ADMIN_USER` i `YIN_PANEL_TEST_ADMIN_PASSWORD` — konto administratora używane przez `npm run provision-member` i zestawy motywów
- Izolowane zestawy motywów i testów wizualnych uruchamiają jednorazową instancję na podstawie `YIN_PANEL_TEST_BINARY`, `YIN_PANEL_TEST_WEB_DIR` i `YIN_PANEL_TEST_LANG_DIR`

Plik `.env.local` pozostaw poza kontrolą wersji; przechowuje on dane uwierzytelniające do testów.

## Szybki start

```bash
# z uruchomioną usługą Core na http://127.0.0.1:3002 i wyewidencjonowanym rozszerzeniem
YIN_PANEL_ENV_FILE='/path/to/Yin-Panel/.env.local' DISPLAY=:0 npm test
```

## Zakres testów

- Logowanie, wygaśnięcie sesji i cykl życia konta
- Przestrzenie: grupy, członkowie, publiczne kody dostępu, sparowane przestrzenie, uprawnienia widza i migracja
- Elementy: tworzenie, edycja, ikony i import/eksport zakładek
- System motywów: wbudowane widoki strony głównej, instalacja i podgląd pakietu v2, powierzchnie Core i wizualne wzorce odniesienia
- Zachowanie PWA w trybie offline i nadpisanie nowej karty przez rozszerzenie
- Pomiary obciążenia, opóźnień i wydajności w katalogu `perf/`

## Polecenia

| Polecenie | Cel |
| --- | --- |
| `npm test` | Domyślny zestaw Playwright |
| `npm run test:headed` | Uruchomienie z widoczną przeglądarką do lokalnego debugowania |
| `npm run test:theme` | Zestawy architektury motywów i pakietów |
| `npm run test:theme:visual` | Wizualne wzorce odniesienia motywów |
| `npm run test:pwa` | Zestaw PWA, wobec pochodzenia HTTPS |
| `npm run perf:smoke` / `npm run perf:load` | Testy k6 w trybie smoke i obciążeniowe |
| `npm run perf:sweep` / `npm run perf:matrix` / `npm run perf:summary` | Przegląd wydajności, macierz mieszanych obciążeń i raport |
| `npm run provision-member` | Utwórz lub użyj ponownie zwykłego członka testowego |

## Dokumentacja

- [AGENTS.md](../../AGENTS.md) — zasady umieszczania testów, odpowiedzialności i bezpieczeństwa danych
- [perf/README.md](../../perf/README.md) — skrypty k6, przegląd wydajności i zastrzeżenia dotyczące pomiarów
- [tests/theme-package-requirements.md](../../tests/theme-package-requirements.md) — mapa wymagań pakietu motywów do testów
- Core: [yinorg/Yin-Panel](https://github.com/yinorg/Yin-Panel); rozszerzenie: [yinorg/yin-panel-extension](https://github.com/yinorg/yin-panel-extension)
- `scripts/readme-screenshots.mjs` odtwarza zrzuty ekranu README Core z izolowanej instancji

Artefakty niepowodzeń są zapisywane w katalogach `test-results/` i `playwright-report/`, które pozostają poza kontrolą wersji.
