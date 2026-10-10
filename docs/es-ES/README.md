# Pruebas de aceptación de extremo a extremo de Yin-Panel

[English](../../README.md) | [简体中文](../zh-CN/README.md) | [繁體中文](../zh-TW/README.md) | [日本語](../ja-JP/README.md) | [한국어](../ko-KR/README.md) | [Deutsch](../de-DE/README.md) | [Français](../fr-FR/README.md) | **Español** | [Português (Brasil)](../pt-BR/README.md) | [Русский](../ru-RU/README.md)

Pruebas de aceptación con Playwright para un servicio Yin-Panel en ejecución y la extensión del navegador sin empaquetar. La suite controla navegadores reales contra la aplicación Core —y la sustitución de la pestaña nueva de la extensión—, de modo que los flujos entre repositorios se verifican de extremo a extremo: inicio de sesión y cuentas, espacios y permisos, elementos y transferencia de marcadores, el sistema de temas y el comportamiento de la PWA. Una suite de k6 independiente mide el mismo servicio bajo carga.

## Requisitos

- Node.js con npm
- Navegadores de Playwright (`npx playwright install`)
- Una instancia de Yin-Panel en ejecución contra la que hacer las pruebas, además de su archivo de entorno del repositorio Core
- El código fuente de la extensión sin empaquetar, para la suite de la extensión
- k6 para los scripts de rendimiento de `perf/`

## Instalación

```bash
cd "$YIN_PANEL_E2E_DIR"
npm ci
npx playwright install
```

## Configuración

Cada configuración carga el archivo de entorno indicado por `YIN_PANEL_ENV_FILE`, que de forma predeterminada es `./.env.local`.

- `YIN_PANEL_URL` — URL base del servicio en ejecución (la suite de la PWA requiere un origen HTTPS)
- `YIN_PANEL_EXTENSION_DIR` — código fuente de la extensión sin empaquetar que carga la prueba de pestaña nueva
- `YIN_PANEL_TEST_USER` y `YIN_PANEL_TEST_PASSWORD`, o `YIN_PANEL_TEST_TOKEN` — cuenta de prueba
- `YIN_PANEL_TEST_SPACE_ID` — espacio bajo prueba, `1` de forma predeterminada
- `DISPLAY` — lo requieren las pruebas de la extensión con interfaz gráfica; use `xvfb-run -a` en CI
- `YIN_PANEL_TEST_ADMIN_USER` y `YIN_PANEL_TEST_ADMIN_PASSWORD` — cuenta de administrador que usan `npm run provision-member` y las suites de temas
- Las suites aisladas de temas y visuales inician una instancia desechable desde `YIN_PANEL_TEST_BINARY`, `YIN_PANEL_TEST_WEB_DIR` y `YIN_PANEL_TEST_LANG_DIR`

Mantenga `.env.local` sin rastrear; contiene credenciales de prueba.

## Inicio rápido

```bash
# con el servicio Core en ejecución en http://127.0.0.1:3002 y la extensión ya clonada
YIN_PANEL_ENV_FILE='/path/to/Yin-Panel/.env.local' DISPLAY=:0 npm test
```

## Qué cubre

- Inicio de sesión, caducidad de sesión y ciclo de vida de la cuenta
- Espacios: grupos, miembros, códigos de acceso público, espacios emparejados, permisos de lector y migración
- Elementos: creación, edición, iconos e importación/exportación de marcadores
- Sistema de temas: vistas de inicio integradas, instalación y vista previa de paquetes v2, superficies del Core y líneas base visuales
- Comportamiento sin conexión de la PWA y la sustitución de la pestaña nueva de la extensión
- Mediciones de carga, latencia y capacidad en `perf/`

## Comandos

| Comando | Propósito |
| --- | --- |
| `npm test` | Suite de Playwright predeterminada |
| `npm run test:headed` | Ejecución con interfaz gráfica para depuración local |
| `npm run test:theme` | Suites de arquitectura de temas y paquetes |
| `npm run test:theme:visual` | Líneas base visuales de temas |
| `npm run test:pwa` | Suite de la PWA, contra un origen HTTPS |
| `npm run perf:smoke` / `npm run perf:load` | Pruebas de humo y carga de k6 |
| `npm run perf:sweep` / `npm run perf:matrix` / `npm run perf:summary` | Barrido de capacidad, matriz de cargas mixtas e informe |
| `npm run provision-member` | Crea o reutiliza el miembro de prueba normal |

## Documentación

- [AGENTS.md](../../AGENTS.md) — reglas de ubicación de pruebas, propiedad y seguridad de los datos
- [perf/README.md](../../perf/README.md) — scripts de k6, barrido de capacidad y advertencias de medición
- [tests/theme-package-requirements.md](../../tests/theme-package-requirements.md) — mapa de requisitos a pruebas del paquete de temas
- Core: [yinorg/Yin-Panel](https://github.com/yinorg/Yin-Panel); extensión: [yinorg/yin-panel-extension](https://github.com/yinorg/yin-panel-extension)
- `scripts/readme-screenshots.mjs` regenera las capturas de pantalla del README del Core desde una instancia aislada

Los artefactos de error se escriben en `test-results/` y `playwright-report/`, y ambos permanecen sin rastrear.
