# Yin-Panel 端對端驗收測試

[English](../../README.md) | [简体中文](../zh-CN/README.md) | **繁體中文** | [日本語](../ja-JP/README.md) | [한국어](../ko-KR/README.md) | [Deutsch](../de-DE/README.md) | [Français](../fr-FR/README.md) | [Español](../es-ES/README.md) | [Português (Brasil)](../pt-BR/README.md) | [Русский](../ru-RU/README.md) | [Bahasa Indonesia](../id-ID/README.md) | [Türkçe](../tr-TR/README.md) | [Polski](../pl-PL/README.md) | [Italiano](../it-IT/README.md) | [Nederlands](../nl-NL/README.md) | [हिन्दी](../hi-IN/README.md) | [ไทย](../th-TH/README.md)

針對執行中的 Yin-Panel 服務與未封裝的瀏覽器擴充功能所撰寫的 Playwright 驗收測試。此測試套件會以真實瀏覽器驅動 Core 應用程式——以及擴充功能的新分頁覆寫——藉此端對端驗證跨儲存庫的工作流程：登入與帳號、空間與權限、項目與書籤轉移、主題系統，以及 PWA 行為。另有一組獨立的 k6 套件在負載下量測同一服務。

## 環境需求

- Node.js 與 npm
- Playwright 瀏覽器（`npx playwright install`）
- 可供測試的執行中 Yin-Panel 執行個體，以及其來自 Core 儲存庫的環境檔案
- 未封裝的擴充功能原始碼，供擴充功能測試套件使用
- k6，用於 `perf/` 下的效能指令碼

## 安裝

```bash
cd "$YIN_PANEL_E2E_DIR"
npm ci
npx playwright install
```

## 設定

每份設定都會載入由 `YIN_PANEL_ENV_FILE` 指定的環境檔案，預設為 `./.env.local`。

- `YIN_PANEL_URL` — 執行中服務的基礎 URL（PWA 測試套件需要 HTTPS 來源）
- `YIN_PANEL_EXTENSION_DIR` — 由新分頁測試載入的未封裝擴充功能原始碼
- `YIN_PANEL_TEST_USER` 與 `YIN_PANEL_TEST_PASSWORD`，或 `YIN_PANEL_TEST_TOKEN` — 測試帳號
- `YIN_PANEL_TEST_SPACE_ID` — 受測空間，預設 `1`
- `DISPLAY` — 有介面的擴充功能測試所需；在 CI 中使用 `xvfb-run -a`
- `YIN_PANEL_TEST_ADMIN_USER` 與 `YIN_PANEL_TEST_ADMIN_PASSWORD` — `npm run provision-member` 與主題測試套件所使用的管理員帳號
- 隔離的主題與視覺測試套件會從 `YIN_PANEL_TEST_BINARY`、`YIN_PANEL_TEST_WEB_DIR` 與 `YIN_PANEL_TEST_LANG_DIR` 啟動一個用完即丟的執行個體

請讓 `.env.local` 保持未納入版本控制；其中含有測試憑證。

## 快速開始

```bash
# Core 服務執行於 http://127.0.0.1:3002，且擴充功能已簽出
YIN_PANEL_ENV_FILE='/path/to/Yin-Panel/.env.local' DISPLAY=:0 npm test
```

## 涵蓋範圍

- 登入、工作階段逾時與帳號生命週期
- 空間：群組、成員、公開存取碼、配對空間、檢視者權限與遷移
- 項目：建立、編輯、圖示，以及書籤匯入／匯出
- 主題系統：內建首頁檢視、套件 v2 安裝與預覽、Core 介面，以及視覺基準
- PWA 離線行為與擴充功能的新分頁覆寫
- `perf/` 下的負載、延遲與容量量測

## 指令

| 指令 | 用途 |
| --- | --- |
| `npm test` | 預設 Playwright 測試套件 |
| `npm run test:headed` | 供本機偵錯的有介面執行 |
| `npm run test:theme` | 主題架構與套件測試套件 |
| `npm run test:theme:visual` | 主題視覺基準 |
| `npm run test:pwa` | PWA 測試套件，針對 HTTPS 來源 |
| `npm run perf:smoke` / `npm run perf:load` | k6 冒煙與負載測試 |
| `npm run perf:sweep` / `npm run perf:matrix` / `npm run perf:summary` | 容量掃描、混合工作負載矩陣與報告 |
| `npm run provision-member` | 建立或重複使用一般測試成員 |

## 文件

- [AGENTS.md](../../AGENTS.md) — 測試放置、歸屬與資料安全規則
- [perf/README.md](../../perf/README.md) — k6 指令碼、容量掃描與量測注意事項
- [tests/theme-package-requirements.md](../../tests/theme-package-requirements.md) — 主題套件需求對應測試的對照表
- Core：[yinorg/Yin-Panel](https://github.com/yinorg/Yin-Panel)；擴充功能：[yinorg/yin-panel-extension](https://github.com/yinorg/yin-panel-extension)
- `scripts/readme-screenshots.mjs` 會從隔離的執行個體重新產生 Core README 的螢幕擷取畫面

失敗產物會寫入 `test-results/` 與 `playwright-report/`，兩者都會保持未納入版本控制。
