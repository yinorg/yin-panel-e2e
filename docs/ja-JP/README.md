# Yin-Panel エンドツーエンド受け入れテスト

[English](../../README.md) | [简体中文](../zh-CN/README.md) | [繁體中文](../zh-TW/README.md) | **日本語** | [한국어](../ko-KR/README.md) | [Deutsch](../de-DE/README.md) | [Français](../fr-FR/README.md) | [Español](../es-ES/README.md) | [Português (Brasil)](../pt-BR/README.md) | [Русский](../ru-RU/README.md) | [Bahasa Indonesia](../id-ID/README.md) | [Türkçe](../tr-TR/README.md) | [Polski](../pl-PL/README.md) | [Italiano](../it-IT/README.md) | [Nederlands](../nl-NL/README.md) | [हिन्दी](../hi-IN/README.md) | [ไทย](../th-TH/README.md)

実行中の Yin-Panel サービスと未パッケージのブラウザー拡張機能に対する Playwright の受け入れテストです。このスイートは実際のブラウザーで Core アプリケーション、および拡張機能の新しいタブのオーバーライドを操作し、リポジトリをまたぐワークフローをエンドツーエンドで検証します：ログインとアカウント、スペースと権限、項目とブックマークの移行、テーマシステム、PWA の動作。別の k6 スイートが同じサービスを負荷時に計測します。

## 要件

- Node.js と npm
- Playwright のブラウザー（`npx playwright install`）
- テスト対象となる実行中の Yin-Panel インスタンス、および Core リポジトリの環境ファイル
- 拡張機能スイート用の未パッケージ拡張機能ソース
- `perf/` 配下のパフォーマンススクリプト用の k6

## インストール

```bash
cd "$YIN_PANEL_E2E_DIR"
npm ci
npx playwright install
```

## 設定

すべての設定は `YIN_PANEL_ENV_FILE` で指定された環境ファイルを読み込み、既定値は `./.env.local` です。

- `YIN_PANEL_URL` — 実行中サービスのベース URL（PWA スイートは HTTPS オリジンが必要です）
- `YIN_PANEL_EXTENSION_DIR` — 新しいタブのテストで読み込む未パッケージ拡張機能ソース
- `YIN_PANEL_TEST_USER` と `YIN_PANEL_TEST_PASSWORD`、または `YIN_PANEL_TEST_TOKEN` — テストアカウント
- `YIN_PANEL_TEST_SPACE_ID` — テスト対象のスペース、既定値 `1`
- `DISPLAY` — ヘッド付き拡張機能テストで必須。CI では `xvfb-run -a` を使用します
- `YIN_PANEL_TEST_ADMIN_USER` と `YIN_PANEL_TEST_ADMIN_PASSWORD` — `npm run provision-member` とテーマスイートで使用する管理者アカウント
- 分離されたテーマスイートとビジュアルスイートは、`YIN_PANEL_TEST_BINARY`、`YIN_PANEL_TEST_WEB_DIR`、`YIN_PANEL_TEST_LANG_DIR` から使い捨てのインスタンスを起動します

`.env.local` は追跡対象外にしてください。テストの認証情報が含まれます。

## クイックスタート

```bash
# Core サービスが http://127.0.0.1:3002 で実行中で、拡張機能がチェックアウトされている状態で
YIN_PANEL_ENV_FILE='/path/to/Yin-Panel/.env.local' DISPLAY=:0 npm test
```

## 対象範囲

- ログイン、セッションの有効期限、アカウントのライフサイクル
- スペース：グループ、メンバー、公開アクセスコード、ペアリングされたスペース、閲覧者の権限、移行
- 項目：作成、編集、アイコン、ブックマークのインポート/エクスポート
- テーマシステム：組み込みのホームビュー、パッケージ v2 のインストールとプレビュー、Core サーフェス、ビジュアルベースライン
- PWA のオフライン動作と拡張機能の新しいタブのオーバーライド
- `perf/` 配下の負荷、レイテンシー、容量の計測

## コマンド

| コマンド | 目的 |
| --- | --- |
| `npm test` | 既定の Playwright スイート |
| `npm run test:headed` | ローカルデバッグ用のヘッド付き実行 |
| `npm run test:theme` | テーマアーキテクチャとパッケージのスイート |
| `npm run test:theme:visual` | テーマのビジュアルベースライン |
| `npm run test:pwa` | HTTPS オリジンに対する PWA スイート |
| `npm run perf:smoke` / `npm run perf:load` | k6 のスモークテストと負荷テスト |
| `npm run perf:sweep` / `npm run perf:matrix` / `npm run perf:summary` | 容量スイープ、混合ワークロードマトリクス、レポート |
| `npm run provision-member` | 通常のテストメンバーを作成または再利用 |

## ドキュメント

- [AGENTS.md](../../AGENTS.md) — テストの配置、所有権、データ安全性のルール
- [perf/README.md](../../perf/README.md) — k6 スクリプト、容量スイープ、計測上の注意
- [tests/theme-package-requirements.md](../../tests/theme-package-requirements.md) — テーマパッケージの要件とテストの対応表
- Core: [yinorg/Yin-Panel](https://github.com/yinorg/Yin-Panel)、拡張機能: [yinorg/yin-panel-extension](https://github.com/yinorg/yin-panel-extension)
- `scripts/readme-screenshots.mjs` は分離されたインスタンスから Core README のスクリーンショットを再生成します

失敗時の成果物は `test-results/` と `playwright-report/` に書き出され、どちらも追跡対象外のままです。
