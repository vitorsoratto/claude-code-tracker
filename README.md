# Claude Token Tracker

Dashboard local para rastrear uso de tokens do Claude (API-equivalent) e comparar com o custo do plano Max ($200/mes).

## Pre-requisitos

- Node.js 22+
- Docker Desktop

## Setup rapido

```bash
# 1. Clone e entre na pasta
cd D:/DOCUMENTOS/Github/claude-token-tracker

# 2. Suba o PostgreSQL
npm run db:up

# 3. Instale dependencias
npm install --workspaces
npm install --save-dev concurrently --ignore-workspace-root-check

# 4. Crie o .env (copie o exemplo)
cp .env.example .env

# 5. Rode as migrations
npm run migrate

# 6. Inicie em modo dev (server + client)
npm run dev
```

Acesse `http://localhost:5173` (dev) ou `http://localhost:3001` (producao).

## Primeiro acesso

1. Abra o app e clique "Criar conta"
2. O **primeiro usuario** registrado vira `super_admin` automaticamente
3. Va em **Configuracoes** e copie seu **Webhook Token**
4. Cole o token nos coletores (veja abaixo)

## Configurar coletores

### Tampermonkey (claude.ai)

Edite `scripts/tampermonkey.js`:

```javascript
const WEBHOOK_URL = 'http://localhost:3001/api/webhook/track-tokens';
const WEBHOOK_TOKEN = 'cole-seu-token-aqui';
```

Instale o script no Tampermonkey.

### Claude Code (Python hook)

Defina as variaveis de ambiente:

```bash
export TOKEN_TRACKER_WEBHOOK=http://localhost:3001/api/webhook/track-tokens
export TOKEN_TRACKER_TOKEN=cole-seu-token-aqui
```

Ou edite diretamente `scripts/claude_code_hook.py`.

### Codex / Pi / Droid (importador local)

O importador lê os registros locais dos harnesses e envia só o delta ainda não enviado:

- Codex: `~/.codex/logs_2.sqlite`
- Pi: `~/.pi/agent/sessions/**/*.jsonl`
- Droid: `~/.factory/sessions/**/*.settings.json`

```bash
export TOKEN_TRACKER_WEBHOOK=http://localhost:3001/api/webhook/track-tokens
export TOKEN_TRACKER_TOKEN=cole-seu-token-aqui

# conferir sem enviar
python3 scripts/harness_importer.py --dry-run --source all

# importar codex/pi/droid
python3 scripts/harness_importer.py --source all
```

Use `--source codex`, `--source pi` ou `--source droid` para importar um harness específico. Por padrão, a primeira execução importa registros dos últimos 30 dias; use `--all-history` para backfill completo.

## Comandos

| Comando | Descricao |
|---------|-----------|
| `npm run dev` | Inicia server (3001) + client (5173) em modo dev |
| `npm run build` | Build de producao (client + server) |
| `npm start` | Inicia server de producao (serve tudo na porta 3001) |
| `npm run migrate` | Roda migrations do banco |
| `npm run import:harnesses` | Importa deltas locais de Codex, Pi e Droid |
| `npm run db:up` | Sobe PostgreSQL via Docker |
| `npm run db:down` | Para o PostgreSQL |

## Stack

- **Frontend:** React 19 + TypeScript + Vite + shadcn/ui + Recharts
- **Backend:** Express 5 + TypeScript
- **Banco:** PostgreSQL 16 (Docker)
- **Auth:** bcrypt + JWT

## Estrutura

```
├── server/          # API Express
│   ├── src/
│   │   ├── routes/      # Endpoints da API
│   │   ├── services/    # Logica de negocio
│   │   ├── middleware/  # Auth, webhook, errors
│   │   └── config/      # DB, env, pricing
│   └── migrations/      # SQL migrations
├── client/          # React app
│   └── src/
│       ├── pages/       # Dashboard, Sessions, Entries, Settings, Admin
│       ├── components/  # UI components
│       ├── hooks/       # React Query hooks
│       └── contexts/    # Auth context
└── scripts/         # Coletores (Tampermonkey + Python hook)
```
