# Yin-Panel 엔드투엔드 인수 테스트

[English](../../README.md) | [简体中文](../zh-CN/README.md) | [繁體中文](../zh-TW/README.md) | [日本語](../ja-JP/README.md) | **한국어** | [Deutsch](../de-DE/README.md) | [Français](../fr-FR/README.md) | [Español](../es-ES/README.md) | [Português (Brasil)](../pt-BR/README.md) | [Русский](../ru-RU/README.md) | [Bahasa Indonesia](../id-ID/README.md) | [Türkçe](../tr-TR/README.md) | [Polski](../pl-PL/README.md) | [Italiano](../it-IT/README.md) | [Nederlands](../nl-NL/README.md) | [हिन्दी](../hi-IN/README.md) | [ไทย](../th-TH/README.md)

실행 중인 Yin-Panel 서비스와 압축을 풀어 둔(unpacked) 브라우저 확장 프로그램을 대상으로 하는 Playwright 인수 테스트입니다. 이 스위트는 실제 브라우저로 Core 애플리케이션과 확장 프로그램의 새 탭 재정의(new-tab override)를 구동하여 리포지토리를 넘나드는 워크플로를 종단 간 검증합니다: 로그인과 계정, 공간과 권한, 항목과 북마크 전송, 테마 시스템, PWA 동작. 별도의 k6 스위트가 동일한 서비스의 부하를 측정합니다.

## 요구 사항

- npm이 포함된 Node.js
- Playwright 브라우저(`npx playwright install`)
- 테스트 대상으로 실행 중인 Yin-Panel 인스턴스와 Core 리포지토리의 환경 파일
- 확장 프로그램 스위트를 위한 압축을 푼 확장 프로그램 소스
- `perf/` 아래 성능 스크립트를 위한 k6

## 설치

```bash
cd "$YIN_PANEL_E2E_DIR"
npm ci
npx playwright install
```

## 구성

모든 구성은 `YIN_PANEL_ENV_FILE`로 지정된 환경 파일을 로드하며, 기본값은 `./.env.local`입니다.

- `YIN_PANEL_URL` — 실행 중인 서비스의 기본 URL(PWA 스위트는 HTTPS 오리진이 필요합니다)
- `YIN_PANEL_EXTENSION_DIR` — 새 탭 테스트가 로드하는 압축을 푼 확장 프로그램 소스
- `YIN_PANEL_TEST_USER`와 `YIN_PANEL_TEST_PASSWORD`, 또는 `YIN_PANEL_TEST_TOKEN` — 테스트 계정
- `YIN_PANEL_TEST_SPACE_ID` — 테스트 대상 공간, 기본값 `1`
- `DISPLAY` — 헤드 모드 확장 프로그램 테스트에 필요하며 CI에서는 `xvfb-run -a`를 사용합니다
- `YIN_PANEL_TEST_ADMIN_USER`와 `YIN_PANEL_TEST_ADMIN_PASSWORD` — `npm run provision-member`와 테마 스위트에서 사용하는 관리자 계정
- 격리된 테마 및 비주얼 스위트는 `YIN_PANEL_TEST_BINARY`, `YIN_PANEL_TEST_WEB_DIR`, `YIN_PANEL_TEST_LANG_DIR`에서 일회용 인스턴스를 시작합니다

`.env.local`은 추적하지 마세요. 테스트 자격 증명이 들어 있습니다.

## 빠른 시작

```bash
# Core 서비스가 http://127.0.0.1:3002에서 실행 중이고 확장 프로그램이 체크아웃된 상태에서
YIN_PANEL_ENV_FILE='/path/to/Yin-Panel/.env.local' DISPLAY=:0 npm test
```

## 다루는 내용

- 로그인, 세션 만료, 계정 수명 주기
- 공간: 그룹, 멤버, 공개 액세스 코드, 페어링된 공간, 뷰어 권한, 마이그레이션
- 항목: 생성, 편집, 아이콘, 북마크 가져오기/내보내기
- 테마 시스템: 내장 홈 뷰, 패키지 v2 설치와 미리 보기, Core 화면, 비주얼 기준선
- PWA 오프라인 동작과 확장 프로그램의 새 탭 재정의
- `perf/` 아래의 부하, 지연 시간, 용량 측정

## 명령

| 명령 | 목적 |
| --- | --- |
| `npm test` | 기본 Playwright 스위트 |
| `npm run test:headed` | 로컬 디버깅용 헤드 모드 실행 |
| `npm run test:theme` | 테마 아키텍처 및 패키지 스위트 |
| `npm run test:theme:visual` | 테마 비주얼 기준선 |
| `npm run test:pwa` | PWA 스위트, HTTPS 오리진 대상 |
| `npm run perf:smoke` / `npm run perf:load` | k6 스모크 및 부하 테스트 |
| `npm run perf:sweep` / `npm run perf:matrix` / `npm run perf:summary` | 용량 스윕, 혼합 워크로드 매트릭스, 리포트 |
| `npm run provision-member` | 일반 테스트 멤버 생성 또는 재사용 |

## 문서

- [AGENTS.md](../../AGENTS.md) — 테스트 배치, 소유권, 데이터 안전 규칙
- [perf/README.md](../../perf/README.md) — k6 스크립트, 용량 스윕, 측정 시 유의 사항
- [tests/theme-package-requirements.md](../../tests/theme-package-requirements.md) — 테마 패키지 요구 사항-테스트 매핑
- Core: [yinorg/Yin-Panel](https://github.com/yinorg/Yin-Panel); 확장 프로그램: [yinorg/yin-panel-extension](https://github.com/yinorg/yin-panel-extension)
- `scripts/readme-screenshots.mjs`는 격리된 인스턴스에서 Core README 스크린샷을 다시 생성합니다

실패 아티팩트는 `test-results/`와 `playwright-report/`에 기록되며, 둘 다 추적되지 않습니다.
