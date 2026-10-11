# Tes penerimaan end-to-end Yin-Panel

[English](../../README.md) | [简体中文](../zh-CN/README.md) | [繁體中文](../zh-TW/README.md) | [日本語](../ja-JP/README.md) | [한국어](../ko-KR/README.md) | [Deutsch](../de-DE/README.md) | [Français](../fr-FR/README.md) | [Español](../es-ES/README.md) | [Português (Brasil)](../pt-BR/README.md) | [Русский](../ru-RU/README.md) | **Bahasa Indonesia** | [Türkçe](../tr-TR/README.md) | [Polski](../pl-PL/README.md) | [Italiano](../it-IT/README.md) | [Nederlands](../nl-NL/README.md) | [हिन्दी](../hi-IN/README.md) | [ไทย](../th-TH/README.md)

Tes penerimaan Playwright untuk layanan Yin-Panel yang berjalan dan ekstensi browser yang belum dikemas. Suite ini mengendalikan browser sungguhan terhadap aplikasi Core — dan penggantian tab baru pada ekstensi — sehingga alur kerja lintas repositori diverifikasi secara menyeluruh: login dan akun, ruang dan izin, item dan pemindahan bookmark, sistem tema, serta perilaku PWA. Suite k6 terpisah mengukur layanan yang sama di bawah beban.

## Persyaratan

- Node.js dengan npm
- Browser Playwright (`npx playwright install`)
- Instans Yin-Panel yang berjalan untuk diuji, beserta berkas lingkungannya dari repositori Core
- Sumber ekstensi yang belum dikemas, untuk suite ekstensi
- k6 untuk skrip performa di bawah `perf/`

## Instalasi

```bash
cd "$YIN_PANEL_E2E_DIR"
npm ci
npx playwright install
```

## Konfigurasi

Setiap konfigurasi memuat berkas lingkungan yang dinamai oleh `YIN_PANEL_ENV_FILE`, yang secara bawaan adalah `./.env.local`.

- `YIN_PANEL_URL` — URL dasar layanan yang berjalan (suite PWA memerlukan origin HTTPS)
- `YIN_PANEL_EXTENSION_DIR` — sumber ekstensi yang belum dikemas yang dimuat oleh pengujian tab baru
- `YIN_PANEL_TEST_USER` dan `YIN_PANEL_TEST_PASSWORD`, atau `YIN_PANEL_TEST_TOKEN` — akun pengujian
- `YIN_PANEL_TEST_SPACE_ID` — ruang yang diuji, bawaan `1`
- `DISPLAY` — diperlukan oleh pengujian ekstensi dengan tampilan (headed); gunakan `xvfb-run -a` di CI
- `YIN_PANEL_TEST_ADMIN_USER` dan `YIN_PANEL_TEST_ADMIN_PASSWORD` — akun administrator yang digunakan oleh `npm run provision-member` dan suite tema
- Suite tema dan visual terisolasi memulai instans sementara dari `YIN_PANEL_TEST_BINARY`, `YIN_PANEL_TEST_WEB_DIR`, dan `YIN_PANEL_TEST_LANG_DIR`

Jaga `.env.local` tetap tidak dilacak; berkas ini menyimpan kredensial pengujian.

## Mulai cepat

```bash
# dengan layanan Core berjalan di http://127.0.0.1:3002 dan ekstensi sudah di-checkout
YIN_PANEL_ENV_FILE='/path/to/Yin-Panel/.env.local' DISPLAY=:0 npm test
```

## Cakupan pengujian

- Login, kedaluwarsa sesi, dan siklus hidup akun
- Ruang: grup, anggota, kode akses publik, ruang berpasangan, izin viewer, dan migrasi
- Item: pembuatan, pengeditan, ikon, dan impor/ekspor bookmark
- Sistem tema: tampilan beranda bawaan, pemasangan dan pratinjau paket v2, permukaan Core, dan baseline visual
- Perilaku offline PWA dan penggantian tab baru pada ekstensi
- Pengukuran beban, latensi, dan kapasitas di bawah `perf/`

## Perintah

| Perintah | Tujuan |
| --- | --- |
| `npm test` | Suite Playwright bawaan |
| `npm run test:headed` | Jalankan dengan tampilan (headed) untuk debugging lokal |
| `npm run test:theme` | Suite arsitektur tema dan paket |
| `npm run test:theme:visual` | Baseline visual tema |
| `npm run test:pwa` | Suite PWA, terhadap origin HTTPS |
| `npm run perf:smoke` / `npm run perf:load` | Uji smoke dan beban k6 |
| `npm run perf:sweep` / `npm run perf:matrix` / `npm run perf:summary` | Sweep kapasitas, matriks beban kerja campuran, dan laporan |
| `npm run provision-member` | Buat atau gunakan kembali anggota pengujian reguler |

## Dokumentasi

- [AGENTS.md](../../AGENTS.md) — penempatan pengujian, kepemilikan, dan aturan keselamatan data
- [perf/README.md](../../perf/README.md) — skrip k6, sweep kapasitas, dan catatan pengukuran
- [tests/theme-package-requirements.md](../../tests/theme-package-requirements.md) — peta persyaratan paket tema ke pengujian
- Core: [yinorg/Yin-Panel](https://github.com/yinorg/Yin-Panel); ekstensi: [yinorg/yin-panel-extension](https://github.com/yinorg/yin-panel-extension)
- `scripts/readme-screenshots.mjs` menghasilkan ulang tangkapan layar README Core dari instans terisolasi

Artefak kegagalan ditulis ke `test-results/` dan `playwright-report/`, keduanya tetap tidak dilacak.
