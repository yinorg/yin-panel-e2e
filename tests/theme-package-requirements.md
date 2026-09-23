# Theme Package Test Map

| Requirement | Automated coverage | Gate |
| --- | --- | --- |
| DTCG 2025.10 documents, inherited types, references, cycles, semantic bindings, color conversion, and contrast | Core `theme` package tests; frontend `performance/theme.spec.ts` | Backend and frontend checks |
| Manifest/API compatibility, missing schemes/bindings, unsafe paths, archive limits, resource digests/types, and invalid signatures | Core `theme` package tests | Backend checks |
| Explicit confirmation for unsigned packages and official/test-key signature state | Core signature tests; E2E install confirmation flow | Backend checks and 5-project matrix |
| Fresh and existing database migration, preservation of legacy rows, atomic upgrade rollback, and uninstall fallback | Core theme migration/store tests; repository PanelConfig serialization test | Backend checks |
| Public built-in theme, administrator authorization, non-admin denial, audit records, default selection, and per-user selection | `theme-package.spec.mjs` API workflows | 5-project matrix, 3 clean runs, retries disabled |
| User-selected theme and light/dark/auto persistence; single-scheme behavior | `theme-package.spec.mjs` browser settings selectors and rendered CSS variables | 5-project matrix, 3 clean runs, retries disabled |
| Upgrade asset cache invalidation and new resource bytes | `theme-package.spec.mjs` browser cache/immutable URL workflow | 5-project matrix, 3 clean runs, retries disabled |
| Existing PanelConfig overrides and explicit adoption of theme defaults | Core PanelConfig serialization test; browser Style Settings workflow | Backend checks and 5-project matrix |
| Invalid packages leave no partial install or default change | Core archive validation tests; `theme-package.spec.mjs` | Backend checks and 5-project matrix |
| Login/theme settings visual output | `theme-visual.spec.mjs` approved Chromium desktop and iPhone 15 WebKit baselines | Maximum pixel difference 0.2% |
| Accessibility, performance, and runtime/network health | Axe WCAG A/AA scan; LCP/CLS and browser error assertions in `theme-package.spec.mjs` | Zero Axe violations; LCP < 2.5s; CLS < 0.1 |
| Theme Package API v2 typed typography, component dimensions, and page layout; v1 compatibility | Core design token tests; frontend token conversion test; v2 browser CSS-variable workflow | Backend/frontend checks and 5-project matrix |
| Theme wallpaper defaults and explicit administrator confirmation for an external webpage default | Core wallpaper and default-selection tests; external wallpaper E2E workflow | Backend checks and 5-project matrix |
| User wallpaper override, opt-out, and isolated local interactive wallpaper | Core web wallpaper validation test; E2E user override and local web bundle workflows | Backend checks and 5-project matrix |
| Admin preview leaves installed state unchanged | E2E upload-preview-install workflow | 5-project matrix |
| Dynamic media fallback, pause, reduced motion, and external embed refusal | E2E wallpaper media workflows and controlled external-site fixture | 5-project matrix |

The official publisher public key must replace the current placeholder before an E2E fixture can prove Yin's production signature. Backend signature verification is tested with generated test keys; unsigned confirmation and invalid-signature rejection are covered independently.
