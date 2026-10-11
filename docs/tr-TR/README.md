# Yin-Panel uçtan uca kabul testleri

[English](../../README.md) | [简体中文](../zh-CN/README.md) | [繁體中文](../zh-TW/README.md) | [日本語](../ja-JP/README.md) | [한국어](../ko-KR/README.md) | [Deutsch](../de-DE/README.md) | [Français](../fr-FR/README.md) | [Español](../es-ES/README.md) | [Português (Brasil)](../pt-BR/README.md) | [Русский](../ru-RU/README.md) | [Bahasa Indonesia](../id-ID/README.md) | **Türkçe** | [Polski](../pl-PL/README.md) | [Italiano](../it-IT/README.md) | [Nederlands](../nl-NL/README.md) | [हिन्दी](../hi-IN/README.md) | [ไทย](../th-TH/README.md)

Çalışan bir Yin-Panel hizmeti ve paketlenmemiş tarayıcı uzantısı için Playwright kabul testleri. Test paketi gerçek tarayıcıları Core uygulamasına — ve uzantının yeni sekme geçersiz kılmasına — yönlendirir, böylece depolar arası iş akışları uçtan uca doğrulanır: giriş ve hesaplar, alanlar ve izinler, öğeler ve yer işareti aktarımı, tema sistemi ve PWA davranışı. Ayrı bir k6 paketi aynı hizmeti yük altında ölçer.

## Gereksinimler

- npm ile Node.js
- Playwright tarayıcıları (`npx playwright install`)
- Test edilecek çalışan bir Yin-Panel örneği ve Core deposundan ortam dosyası
- Uzantı paketi için paketlenmemiş uzantı kaynak kodu
- `perf/` altındaki performans betikleri için k6

## Kurulum

```bash
cd "$YIN_PANEL_E2E_DIR"
npm ci
npx playwright install
```

## Yapılandırma

Her yapılandırma, `YIN_PANEL_ENV_FILE` ile adlandırılan ve varsayılanı `./.env.local` olan ortam dosyasını yükler.

- `YIN_PANEL_URL` — çalışan hizmetin temel URL'si (PWA paketi bir HTTPS kaynağı gerektirir)
- `YIN_PANEL_EXTENSION_DIR` — yeni sekme testi tarafından yüklenen paketlenmemiş uzantı kaynak kodu
- `YIN_PANEL_TEST_USER` ile `YIN_PANEL_TEST_PASSWORD` veya `YIN_PANEL_TEST_TOKEN` — test hesabı
- `YIN_PANEL_TEST_SPACE_ID` — test edilen alan, varsayılan `1`
- `DISPLAY` — başsız olmayan (headed) uzantı testleri için gereklidir; CI'da `xvfb-run -a` kullanın
- `YIN_PANEL_TEST_ADMIN_USER` ile `YIN_PANEL_TEST_ADMIN_PASSWORD` — `npm run provision-member` ve tema paketleri tarafından kullanılan yönetici hesabı
- Yalıtılmış tema ve görsel paketler, `YIN_PANEL_TEST_BINARY`, `YIN_PANEL_TEST_WEB_DIR` ve `YIN_PANEL_TEST_LANG_DIR` üzerinden tek kullanımlık bir örnek başlatır

`.env.local` dosyasını sürüm kontrolü dışında tutun; test kimlik bilgilerini barındırır.

## Hızlı başlangıç

```bash
# Core hizmeti http://127.0.0.1:3002 adresinde çalışırken ve uzantı checkout edilmişken
YIN_PANEL_ENV_FILE='/path/to/Yin-Panel/.env.local' DISPLAY=:0 npm test
```

## Neleri kapsar

- Giriş, oturum süresinin dolması ve hesap yaşam döngüsü
- Alanlar: gruplar, üyeler, herkese açık erişim kodları, eşleştirilmiş alanlar, görüntüleyici izinleri ve geçiş
- Öğeler: oluşturma, düzenleme, simgeler ve yer işareti içe/dışa aktarma
- Tema sistemi: yerleşik ana sayfa görünümleri, paket v2 kurulumu ve önizlemesi, Core yüzeyleri ve görsel temel ölçümler
- PWA çevrimdışı davranışı ve uzantının yeni sekme geçersiz kılması
- `perf/` altında yük, gecikme ve kapasite ölçümleri

## Komutlar

| Komut | Amaç |
| --- | --- |
| `npm test` | Varsayılan Playwright paketi |
| `npm run test:headed` | Yerel hata ayıklama için başsız olmayan çalıştırma |
| `npm run test:theme` | Tema mimarisi ve paket testleri |
| `npm run test:theme:visual` | Tema görsel temel ölçümleri |
| `npm run test:pwa` | PWA paketi, bir HTTPS kaynağına karşı |
| `npm run perf:smoke` / `npm run perf:load` | k6 duman ve yük testleri |
| `npm run perf:sweep` / `npm run perf:matrix` / `npm run perf:summary` | Kapasite taraması, karma iş yükü matrisi ve rapor |
| `npm run provision-member` | Normal test üyesini oluştur veya yeniden kullan |

## Dokümantasyon

- [AGENTS.md](../../AGENTS.md) — test yerleşimi, sahiplik ve veri güvenliği kuralları
- [perf/README.md](../../perf/README.md) — k6 betikleri, kapasite taraması ve ölçümle ilgili uyarılar
- [tests/theme-package-requirements.md](../../tests/theme-package-requirements.md) — tema paketi gereksinim-test eşlemesi
- Core: [yinorg/Yin-Panel](https://github.com/yinorg/Yin-Panel); uzantı: [yinorg/yin-panel-extension](https://github.com/yinorg/yin-panel-extension)
- `scripts/readme-screenshots.mjs`, Core README ekran görüntülerini yalıtılmış bir örnekten yeniden üretir

Başarısızlık çıktıları `test-results/` ve `playwright-report/` dizinlerine yazılır; ikisi de sürüm kontrolü dışında kalır.
