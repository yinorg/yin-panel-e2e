# Tests d'acceptation de bout en bout de Yin-Panel

[English](../../README.md) | [简体中文](../zh-CN/README.md) | [繁體中文](../zh-TW/README.md) | [日本語](../ja-JP/README.md) | [한국어](../ko-KR/README.md) | [Deutsch](../de-DE/README.md) | **Français** | [Español](../es-ES/README.md) | [Português (Brasil)](../pt-BR/README.md) | [Русский](../ru-RU/README.md) | [Bahasa Indonesia](../id-ID/README.md) | [Türkçe](../tr-TR/README.md) | [Polski](../pl-PL/README.md) | [Italiano](../it-IT/README.md) | [Nederlands](../nl-NL/README.md) | [हिन्दी](../hi-IN/README.md) | [ไทย](../th-TH/README.md)

Tests d'acceptation Playwright pour un service Yin-Panel en cours d'exécution et l'extension de navigateur non empaquetée. La suite pilote de vrais navigateurs contre l'application Core — et la substitution du nouvel onglet par l'extension — afin de vérifier de bout en bout les flux inter-dépôts : connexion et comptes, espaces et permissions, éléments et transfert de signets, le système de thèmes et le comportement PWA. Une suite k6 distincte mesure le même service sous charge.

## Prérequis

- Node.js avec npm
- Navigateurs Playwright (`npx playwright install`)
- Une instance Yin-Panel en cours d'exécution pour les tests, ainsi que son fichier d'environnement du dépôt Core
- La source de l'extension non empaquetée, pour la suite d'extension
- k6 pour les scripts de performance sous `perf/`

## Installation

```bash
cd "$YIN_PANEL_E2E_DIR"
npm ci
npx playwright install
```

## Configuration

Chaque configuration charge le fichier d'environnement nommé par `YIN_PANEL_ENV_FILE`, qui vaut `./.env.local` par défaut.

- `YIN_PANEL_URL` — URL de base du service en cours d'exécution (la suite PWA exige une origine HTTPS)
- `YIN_PANEL_EXTENSION_DIR` — source de l'extension non empaquetée chargée par le test du nouvel onglet
- `YIN_PANEL_TEST_USER` et `YIN_PANEL_TEST_PASSWORD`, ou `YIN_PANEL_TEST_TOKEN` — compte de test
- `YIN_PANEL_TEST_SPACE_ID` — espace testé, `1` par défaut
- `DISPLAY` — requis par les tests d'extension en mode headed ; utilisez `xvfb-run -a` en CI
- `YIN_PANEL_TEST_ADMIN_USER` et `YIN_PANEL_TEST_ADMIN_PASSWORD` — compte administrateur utilisé par `npm run provision-member` et les suites de thèmes
- Les suites isolées de thèmes et de visuels démarrent une instance jetable à partir de `YIN_PANEL_TEST_BINARY`, `YIN_PANEL_TEST_WEB_DIR` et `YIN_PANEL_TEST_LANG_DIR`

Gardez `.env.local` non suivi ; il contient les identifiants de test.

## Démarrage rapide

```bash
# avec le service Core en cours d'exécution sur http://127.0.0.1:3002 et l'extension récupérée
YIN_PANEL_ENV_FILE='/path/to/Yin-Panel/.env.local' DISPLAY=:0 npm test
```

## Ce qui est couvert

- Connexion, expiration de session et cycle de vie du compte
- Espaces : groupes, membres, codes d'accès public, espaces appairés, permissions de lecteur et migration
- Éléments : création, édition, icônes et import/export de signets
- Système de thèmes : vues d'accueil intégrées, installation et aperçu des paquets v2, surfaces Core et références visuelles
- Comportement hors ligne de la PWA et substitution du nouvel onglet par l'extension
- Mesures de charge, de latence et de capacité sous `perf/`

## Commandes

| Commande | Objet |
| --- | --- |
| `npm test` | Suite Playwright par défaut |
| `npm run test:headed` | Exécution en mode headed pour le débogage local |
| `npm run test:theme` | Suites d'architecture de thèmes et de paquets |
| `npm run test:theme:visual` | Références visuelles des thèmes |
| `npm run test:pwa` | Suite PWA, sur une origine HTTPS |
| `npm run perf:smoke` / `npm run perf:load` | Tests de fumée et de charge k6 |
| `npm run perf:sweep` / `npm run perf:matrix` / `npm run perf:summary` | Balayage de capacité, matrice de charges mixtes et rapport |
| `npm run provision-member` | Créer ou réutiliser le membre de test ordinaire |

## Documentation

- [AGENTS.md](../../AGENTS.md) — placement des tests, propriété et règles de sécurité des données
- [perf/README.md](../../perf/README.md) — scripts k6, balayage de capacité et réserves sur les mesures
- [tests/theme-package-requirements.md](../../tests/theme-package-requirements.md) — correspondance exigences-tests des paquets de thèmes
- Core : [yinorg/Yin-Panel](https://github.com/yinorg/Yin-Panel) ; extension : [yinorg/yin-panel-extension](https://github.com/yinorg/yin-panel-extension)
- `scripts/readme-screenshots.mjs` régénère les captures d'écran du README du Core à partir d'une instance isolée

Les artefacts d'échec sont écrits dans `test-results/` et `playwright-report/`, tous deux non suivis.
