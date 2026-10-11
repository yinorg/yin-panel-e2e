# การทดสอบการยอมรับแบบ end-to-end ของ Yin-Panel

[English](../../README.md) | [简体中文](../zh-CN/README.md) | [繁體中文](../zh-TW/README.md) | [日本語](../ja-JP/README.md) | [한국어](../ko-KR/README.md) | [Deutsch](../de-DE/README.md) | [Français](../fr-FR/README.md) | [Español](../es-ES/README.md) | [Português (Brasil)](../pt-BR/README.md) | [Русский](../ru-RU/README.md) | [Bahasa Indonesia](../id-ID/README.md) | [Türkçe](../tr-TR/README.md) | [Polski](../pl-PL/README.md) | [Italiano](../it-IT/README.md) | [Nederlands](../nl-NL/README.md) | [हिन्दी](../hi-IN/README.md) | **ไทย**

การทดสอบการยอมรับด้วย Playwright สำหรับบริการ Yin-Panel ที่ทำงานอยู่และส่วนขยายเบราว์เซอร์แบบ unpacked ชุดทดสอบนี้ขับเบราว์เซอร์จริงกับแอปพลิเคชัน Core และการแทนที่แท็บใหม่ของส่วนขยาย เพื่อยืนยันเวิร์กโฟลว์ข้าม repository แบบ end to end ได้แก่ การเข้าสู่ระบบและบัญชี สเปซและสิทธิ์ รายการและการถ่ายโอนบุ๊กมาร์ก ระบบธีม และพฤติกรรม PWA นอกจากนี้ยังมีชุดทดสอบ k6 แยกต่างหากสำหรับวัดบริการเดียวกันภายใต้โหลด

## ข้อกำหนด

- Node.js พร้อม npm
- เบราว์เซอร์ของ Playwright (`npx playwright install`)
- อินสแตนซ์ Yin-Panel ที่ทำงานอยู่สำหรับทดสอบ รวมถึงไฟล์ environment จาก repository Core
- ซอร์สของส่วนขยายแบบ unpacked สำหรับชุดทดสอบส่วนขยาย
- k6 สำหรับสคริปต์ประสิทธิภาพภายใต้ `perf/`

## การติดตั้ง

```bash
cd "$YIN_PANEL_E2E_DIR"
npm ci
npx playwright install
```

## การตั้งค่า

การตั้งค่าทุกแบบจะโหลดไฟล์ environment ที่ระบุโดย `YIN_PANEL_ENV_FILE` ซึ่งมีค่าเริ่มต้นเป็น `./.env.local`

- `YIN_PANEL_URL` — URL หลักของบริการที่ทำงานอยู่ (ชุดทดสอบ PWA ต้องใช้ต้นทาง HTTPS)
- `YIN_PANEL_EXTENSION_DIR` — ซอร์สของส่วนขยายแบบ unpacked ที่โหลดโดยการทดสอบแท็บใหม่
- `YIN_PANEL_TEST_USER` และ `YIN_PANEL_TEST_PASSWORD` หรือ `YIN_PANEL_TEST_TOKEN` — บัญชีทดสอบ
- `YIN_PANEL_TEST_SPACE_ID` — สเปซที่ทดสอบ ค่าเริ่มต้น `1`
- `DISPLAY` — จำเป็นสำหรับการทดสอบส่วนขยายแบบมีหน้าต่าง ให้ใช้ `xvfb-run -a` ใน CI
- `YIN_PANEL_TEST_ADMIN_USER` และ `YIN_PANEL_TEST_ADMIN_PASSWORD` — บัญชีผู้ดูแลที่ใช้โดย `npm run provision-member` และชุดทดสอบธีม
- ชุดทดสอบธีมแบบแยกและชุดทดสอบภาพจะเริ่มอินสแตนซ์ชั่วคราวจาก `YIN_PANEL_TEST_BINARY`, `YIN_PANEL_TEST_WEB_DIR` และ `YIN_PANEL_TEST_LANG_DIR`

เก็บ `.env.local` ไว้แบบไม่ติดตาม (untracked) เนื่องจากมีข้อมูลรับรองสำหรับทดสอบ

## เริ่มต้นอย่างรวดเร็ว

```bash
# โดยมีบริการ Core ทำงานอยู่ที่ http://127.0.0.1:3002 และส่วนขยายถูกเช็กเอาต์แล้ว
YIN_PANEL_ENV_FILE='/path/to/Yin-Panel/.env.local' DISPLAY=:0 npm test
```

## สิ่งที่ครอบคลุม

- การเข้าสู่ระบบ การหมดอายุของเซสชัน และวงจรชีวิตของบัญชี
- สเปซ: กลุ่ม สมาชิก รหัสการเข้าถึงสาธารณะ สเปซที่จับคู่กัน สิทธิ์ของผู้ชม และการย้ายข้อมูล
- รายการ: การสร้าง การแก้ไข ไอคอน และการนำเข้า/ส่งออกบุ๊กมาร์ก
- ระบบธีม: มุมมองหน้าแรกที่มีมาให้ การติดตั้งและดูตัวอย่างแพ็กเกจ v2 พื้นผิวของ Core และค่าอ้างอิงภาพ
- พฤติกรรมออฟไลน์ของ PWA และการแทนที่แท็บใหม่ของส่วนขยาย
- การวัดโหลด เวลาแฝง และความจุภายใต้ `perf/`

## คำสั่ง

| คำสั่ง | วัตถุประสงค์ |
| --- | --- |
| `npm test` | ชุดทดสอบ Playwright เริ่มต้น |
| `npm run test:headed` | รันแบบมีหน้าต่างสำหรับการดีบักในเครื่อง |
| `npm run test:theme` | ชุดทดสอบสถาปัตยกรรมธีมและแพ็กเกจธีม |
| `npm run test:theme:visual` | ค่าอ้างอิงภาพของธีม |
| `npm run test:pwa` | ชุดทดสอบ PWA โดยทดสอบกับต้นทาง HTTPS |
| `npm run perf:smoke` / `npm run perf:load` | การทดสอบ smoke และ load ด้วย k6 |
| `npm run perf:sweep` / `npm run perf:matrix` / `npm run perf:summary` | การกวาดหาความจุ เมทริกซ์งานผสม และรายงาน |
| `npm run provision-member` | สร้างหรือใช้สมาชิกทดสอบทั่วไปซ้ำ |

## เอกสาร

- [AGENTS.md](../../AGENTS.md) — กฎการจัดวางการทดสอบ ความเป็นเจ้าของ และความปลอดภัยของข้อมูล
- [perf/README.md](../../perf/README.md) — สคริปต์ k6 การกวาดหาความจุ และข้อควรระวังในการวัด
- [tests/theme-package-requirements.md](../../tests/theme-package-requirements.md) — แผนที่ความต้องการของแพ็กเกจธีมไปยังการทดสอบ
- Core: [yinorg/Yin-Panel](https://github.com/yinorg/Yin-Panel); ส่วนขยาย: [yinorg/yin-panel-extension](https://github.com/yinorg/yin-panel-extension)
- `scripts/readme-screenshots.mjs` สร้างภาพหน้าจอของ README ใน Core ใหม่จากอินสแตนซ์แบบแยก

อาร์ติแฟกต์ความล้มเหลวจะถูกเขียนไว้ที่ `test-results/` และ `playwright-report/` ซึ่งทั้งคู่จะไม่ถูกติดตาม (untracked)
