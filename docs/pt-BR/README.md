# Testes de aceitação ponta a ponta do Yin-Panel

[English](../../README.md) | [简体中文](../zh-CN/README.md) | [繁體中文](../zh-TW/README.md) | [日本語](../ja-JP/README.md) | [한국어](../ko-KR/README.md) | [Deutsch](../de-DE/README.md) | [Français](../fr-FR/README.md) | [Español](../es-ES/README.md) | **Português (Brasil)** | [Русский](../ru-RU/README.md)

Testes de aceitação em Playwright para um serviço Yin-Panel em execução e a extensão de navegador descompactada. A suíte controla navegadores reais contra a aplicação Core — e a substituição da nova aba da extensão — para que os fluxos entre repositórios sejam verificados ponta a ponta: login e contas, espaços e permissões, itens e transferência de favoritos, o sistema de temas e o comportamento de PWA. Uma suíte k6 separada mede o mesmo serviço sob carga.

## Requisitos

- Node.js com npm
- Navegadores do Playwright (`npx playwright install`)
- Uma instância do Yin-Panel em execução para testar, além do arquivo de ambiente dela do repositório Core
- O código-fonte da extensão descompactada, para a suíte da extensão
- k6 para os scripts de desempenho em `perf/`

## Instalação

```bash
cd "$YIN_PANEL_E2E_DIR"
npm ci
npx playwright install
```

## Configuração

Toda configuração carrega o arquivo de ambiente indicado por `YIN_PANEL_ENV_FILE`, que tem `./.env.local` como padrão.

- `YIN_PANEL_URL` — URL base do serviço em execução (a suíte PWA exige uma origem HTTPS)
- `YIN_PANEL_EXTENSION_DIR` — código-fonte da extensão descompactada carregado pelo teste de nova aba
- `YIN_PANEL_TEST_USER` e `YIN_PANEL_TEST_PASSWORD`, ou `YIN_PANEL_TEST_TOKEN` — conta de teste
- `YIN_PANEL_TEST_SPACE_ID` — espaço em teste, padrão `1`
- `DISPLAY` — exigido pelos testes de extensão com interface gráfica; use `xvfb-run -a` na CI
- `YIN_PANEL_TEST_ADMIN_USER` e `YIN_PANEL_TEST_ADMIN_PASSWORD` — conta de administrador usada por `npm run provision-member` e pelas suítes de temas
- As suítes isoladas de temas e visual iniciam uma instância descartável a partir de `YIN_PANEL_TEST_BINARY`, `YIN_PANEL_TEST_WEB_DIR` e `YIN_PANEL_TEST_LANG_DIR`

Mantenha o `.env.local` fora do controle de versão; ele contém as credenciais de teste.

## Início rápido

```bash
# com o serviço Core em execução em http://127.0.0.1:3002 e a extensão obtida do repositório
YIN_PANEL_ENV_FILE='/path/to/Yin-Panel/.env.local' DISPLAY=:0 npm test
```

## O que cobre

- Login, expiração de sessão e ciclo de vida da conta
- Espaços: grupos, membros, códigos de acesso público, espaços pareados, permissões de visualizador e migração
- Itens: criação, edição, ícones e importação/exportação de favoritos
- Sistema de temas: visões iniciais integradas, instalação e pré-visualização de pacotes v2, superfícies do Core e baselines visuais
- Comportamento offline do PWA e a substituição da nova aba da extensão
- Medições de carga, latência e capacidade em `perf/`

## Comandos

| Comando | Finalidade |
| --- | --- |
| `npm test` | Suíte padrão do Playwright |
| `npm run test:headed` | Execução com interface gráfica para depuração local |
| `npm run test:theme` | Suítes de arquitetura de temas e de pacotes |
| `npm run test:theme:visual` | Baselines visuais de temas |
| `npm run test:pwa` | Suíte PWA, contra uma origem HTTPS |
| `npm run perf:smoke` / `npm run perf:load` | Testes de fumaça e de carga com k6 |
| `npm run perf:sweep` / `npm run perf:matrix` / `npm run perf:summary` | Varredura de capacidade, matriz de cargas mistas e relatório |
| `npm run provision-member` | Cria ou reutiliza o membro de teste comum |

## Documentação

- [AGENTS.md](../../AGENTS.md) — posicionamento, propriedade e regras de segurança de dados dos testes
- [perf/README.md](../../perf/README.md) — scripts k6, varredura de capacidade e ressalvas de medição
- [tests/theme-package-requirements.md](../../tests/theme-package-requirements.md) — mapa de requisitos para testes do pacote de temas
- Core: [yinorg/Yin-Panel](https://github.com/yinorg/Yin-Panel); extensão: [yinorg/yin-panel-extension](https://github.com/yinorg/yin-panel-extension)
- `scripts/readme-screenshots.mjs` regenera as capturas de tela do README do Core a partir de uma instância isolada

Os artefatos de falha são gravados em `test-results/` e `playwright-report/`, ambos mantidos fora do controle de versão.
