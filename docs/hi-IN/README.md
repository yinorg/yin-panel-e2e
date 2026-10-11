# Yin-Panel एंड-टू-एंड स्वीकृति परीक्षण

[English](../../README.md) | [简体中文](../zh-CN/README.md) | [繁體中文](../zh-TW/README.md) | [日本語](../ja-JP/README.md) | [한국어](../ko-KR/README.md) | [Deutsch](../de-DE/README.md) | [Français](../fr-FR/README.md) | [Español](../es-ES/README.md) | [Português (Brasil)](../pt-BR/README.md) | [Русский](../ru-RU/README.md) | [Bahasa Indonesia](../id-ID/README.md) | [Türkçe](../tr-TR/README.md) | [Polski](../pl-PL/README.md) | [Italiano](../it-IT/README.md) | [Nederlands](../nl-NL/README.md) | **हिन्दी** | [ไทย](../th-TH/README.md)

यह एक चल रहे Yin-Panel सेवा और unpacked ब्राउज़र एक्सटेंशन के लिए Playwright स्वीकृति परीक्षण हैं। यह सूट वास्तविक ब्राउज़रों को Core एप्लिकेशन — और एक्सटेंशन की new-tab override — के विरुद्ध चलाता है, ताकि क्रॉस-रिपॉज़िटरी वर्कफ़्लो को एंड टू एंड सत्यापित किया जा सके: लॉगिन और खाते, स्पेस और अनुमतियाँ, आइटम और बुकमार्क स्थानांतरण, थीम सिस्टम और PWA व्यवहार। एक अलग k6 सूट उसी सेवा को लोड के अधीन मापता है।

## आवश्यकताएँ

- npm के साथ Node.js
- Playwright ब्राउज़र (`npx playwright install`)
- परीक्षण के लिए चलता हुआ Yin-Panel इंस्टेंस, तथा Core रिपॉज़िटरी की उसकी environment फ़ाइल
- extension सूट के लिए unpacked एक्सटेंशन स्रोत
- `perf/` के अंतर्गत performance स्क्रिप्ट के लिए k6

## इंस्टॉलेशन

```bash
cd "$YIN_PANEL_E2E_DIR"
npm ci
npx playwright install
```

## कॉन्फ़िगरेशन

प्रत्येक config उस environment फ़ाइल को लोड करता है जिसका नाम `YIN_PANEL_ENV_FILE` में दिया गया होता है, जिसका डिफ़ॉल्ट `./.env.local` है।

- `YIN_PANEL_URL` — चल रही सेवा का बेस URL (PWA सूट के लिए HTTPS ओरिजिन आवश्यक है)
- `YIN_PANEL_EXTENSION_DIR` — new-tab परीक्षण द्वारा लोड किया जाने वाला unpacked एक्सटेंशन स्रोत
- `YIN_PANEL_TEST_USER` और `YIN_PANEL_TEST_PASSWORD`, या `YIN_PANEL_TEST_TOKEN` — परीक्षण खाता
- `YIN_PANEL_TEST_SPACE_ID` — परीक्षणाधीन स्पेस, डिफ़ॉल्ट `1`
- `DISPLAY` — headed extension परीक्षणों के लिए आवश्यक; CI में `xvfb-run -a` का उपयोग करें
- `YIN_PANEL_TEST_ADMIN_USER` और `YIN_PANEL_TEST_ADMIN_PASSWORD` — `npm run provision-member` और theme सूट द्वारा उपयोग किया जाने वाला administrator खाता
- isolated theme और visual सूट `YIN_PANEL_TEST_BINARY`, `YIN_PANEL_TEST_WEB_DIR` और `YIN_PANEL_TEST_LANG_DIR` से एक अस्थायी इंस्टेंस शुरू करते हैं

`.env.local` को untracked रखें; इसमें परीक्षण क्रेडेंशियल होते हैं।

## त्वरित शुरुआत

```bash
# Core सेवा http://127.0.0.1:3002 पर चल रही हो और एक्सटेंशन checkout हो
YIN_PANEL_ENV_FILE='/path/to/Yin-Panel/.env.local' DISPLAY=:0 npm test
```

## इसमें क्या शामिल है

- लॉगिन, सत्र समाप्ति और खाता जीवनचक्र
- स्पेस: समूह, सदस्य, सार्वजनिक एक्सेस कोड, युग्मित स्पेस, viewer अनुमतियाँ और माइग्रेशन
- आइटम: निर्माण, संपादन, आइकन और बुकमार्क आयात/निर्यात
- थीम सिस्टम: अंतर्निहित होम व्यू, package v2 इंस्टॉल और पूर्वावलोकन, Core surfaces और visual baselines
- PWA ऑफ़लाइन व्यवहार और एक्सटेंशन की new-tab override
- `perf/` के अंतर्गत लोड, लेटेंसी और क्षमता मापन

## कमांड

| कमांड | उद्देश्य |
| --- | --- |
| `npm test` | डिफ़ॉल्ट Playwright सूट |
| `npm run test:headed` | स्थानीय डीबगिंग के लिए headed रन |
| `npm run test:theme` | Theme आर्किटेक्चर और package सूट |
| `npm run test:theme:visual` | Theme visual baselines |
| `npm run test:pwa` | PWA सूट, HTTPS ओरिजिन के विरुद्ध |
| `npm run perf:smoke` / `npm run perf:load` | k6 smoke और load परीक्षण |
| `npm run perf:sweep` / `npm run perf:matrix` / `npm run perf:summary` | Capacity sweep, mixed-workload matrix और रिपोर्ट |
| `npm run provision-member` | नियमित परीक्षण सदस्य बनाएँ या पुनः उपयोग करें |

## दस्तावेज़ीकरण

- [AGENTS.md](../../AGENTS.md) — परीक्षण स्थान, स्वामित्व और डेटा-सुरक्षा नियम
- [perf/README.md](../../perf/README.md) — k6 स्क्रिप्ट, capacity sweep और मापन संबंधी चेतावनियाँ
- [tests/theme-package-requirements.md](../../tests/theme-package-requirements.md) — थीम पैकेज आवश्यकता-से-परीक्षण मैपिंग
- Core: [yinorg/Yin-Panel](https://github.com/yinorg/Yin-Panel); एक्सटेंशन: [yinorg/yin-panel-extension](https://github.com/yinorg/yin-panel-extension)
- `scripts/readme-screenshots.mjs` एक isolated इंस्टेंस से Core README स्क्रीनशॉट पुनः जनरेट करता है

विफलता artifacts `test-results/` और `playwright-report/` में लिखे जाते हैं, दोनों untracked रहते हैं।
