# Neobee

AI 原生头脑风暴平台。用户提交主题 → 多阶段 LLM 管道 → 结构化创业想法。

## Tech Stack

- **Frontend**: React 18 + Vite 5 + TypeScript + i18next + plain CSS
- **Backend**: Express + LangChain (Anthropic, OpenAI) + better-sqlite3 + WebSocket
- **Shared**: TypeScript types package
- **Build**: npm workspaces (no Turborepo)

## Project Structure

```
neobee/
  apps/server/   — Express + LangChain 后端
  apps/web/      — React + Vite 前端
  packages/shared/ — 共享 TS 类型
```

## Key Architecture

- **Event-driven orchestration**: StageOrchestrator uses EventBus-based scheduling
- **Worker thread execution**: LLM chains run via worker-pool (worker_threads)
- **SQLite + in-memory dual write**: SessionStore mirrors data in both
- **Event-driven WebSocket**: EventBus -> WebSocket push to frontend
- **Config**: `~/.neobee/neobee.json` for LLM provider settings

## Pipeline Stages

1. topic_intake (form input)
2. deep_research (web search + LLM analysis)
3. expert_creation (generate expert personas)
4. insight_refinement (multi-round expert insights)
5. cross_review (experts review each other)
6. idea_synthesis (generate startup ideas)

## Commands

- `npm run dev` — 启动 server + web
- `npm run build` — 构建 shared -> server -> web
- `npm run dev:server` — 仅启动后端 (port 4001)
- `npm run dev:web` — 仅启动前端 (port 3000, proxy -> 4001)

## Coding Conventions

- TypeScript strict mode
- No NestJS — plain Express only
- CSS: `nb-` prefixed class names, CSS variables for theming
- i18n: `useTranslation()` hook, flat keys (en/zh)
- No component libraries — plain CSS