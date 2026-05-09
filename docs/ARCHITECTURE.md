# Neobee Architecture

> AI-native ideation engine — multi-stage LLM-driven research and idea generation.

## Overview

Neobee is an **AI-native brainstorming platform**. Users submit a topic, and the system orchestrates a multi-stage pipeline of LLM calls — researching the topic, simulating expert panels, generating cross-reviewed insights, and synthesizing startup ideas — all persisted to SQLite and streamed to a React frontend via REST + WebSocket.

---

## Monorepo Structure

```
neobee/                          # npm workspaces root
├── apps/
│   ├── server/                  # @neobee/server — Express + LangChain backend
│   └── web/                     # @neobee/web — React + Vite frontend
├── packages/
│   └── shared/                  # @neobee/shared — TypeScript types shared by server & web
├── docs/
│   └── ARCHITECTURE.md          # This file
├── package.json                 # Workspace root
└── tsconfig.base.json           # Shared TypeScript config
```

**Dev ports:** Server `:4001` (HTTP + WebSocket), Web `:3000` (Vite, proxies `/api` and WS to `:4001`).

---

## Package: `@neobee/shared`

Single file (`packages/shared/src/index.ts`) exporting all shared types:

| Category | Key Types |
|---|---|
| **Session** | `SessionStage`, `SessionStatus`, `SessionRecord`, `CreateSessionInput`, `SessionAggregate` |
| **Pipeline data** | `ResearchBrief`, `ExpertProfile`, `Insight`, `InsightLink`, `ReviewScore`, `IdeaCandidate`, `SummaryDocument` |
| **Graph** | `GraphNode`, `GraphEdge`, `GraphData` |
| **Real-time** | `SessionEvent`, `SessionEventType`, `TaskProgressPayload` |
| **State** | `SessionCheckpoint`, `SessionRound` |

### Pipeline Stages (ordered)

```typescript
export type SessionStage =
  | 'topic_intake'        // initial form input (not a processing stage)
  | 'deep_research'       // web research via LLM + search tool
  | 'expert_creation'     // generate expert personae from research
  | 'insight_refinement'  // N rounds × M experts generating insights
  | 'cross_review'        // experts score each other's insights
  | 'idea_synthesis'      // synthesize startup ideas from reviewed insights
  | 'graph_build'         // build knowledge graph (nodes + edges)
  | 'summary';            // executive summary
```

### Session Status State Machine

```
created → researching → experts_generated → debating → reviewing → synthesizing → completed
                                                                                       └→ failed (any stage)
paused can interrupt any processing stage and be resumed.
```

---

## Package: `@neobee/server`

### Entry Point (`apps/server/src/main.ts`)

Express app that wires the system together:

1. Creates `EventBus` (decoupled event pub/sub)
2. Creates `SessionStore` (in-memory + SQLite persistence), attaches it to EventBus as a recorder
3. Creates `SessionsService` (business logic layer)
4. Creates `StageOrchestrator`, calls `startAll()` to begin polling
5. Attaches REST routes, starts HTTP server, attaches WebSocket server

### Architecture Layers

```
┌─────────────────────────────────────────────────────┐
│                    Express Routes                    │
│  GET/POST /api/sessions  /run  /pause  /resume ...  │
└──────────────────────┬──────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────┐
│              SessionsService (business logic)        │
│  createSession / runSession / pause / resume / state │
└──────┬───────────────────────────────────┬──────────┘
       │                                   │
┌──────▼──────────┐          ┌─────────────▼──────────┐
│  SessionStore    │          │  StageOrchestrator      │
│  (in-memory +   │          │  ┌──────────────────┐   │
│   SQLite)        │          │  │ DeepResearchCtlr │   │
│                  │          │  │ ExpertCreationCtlr│   │
│                  │          │  │ InsightRefineCtlr │   │
│                  │          │  │ CrossReviewCtlr   │   │
│                  │          │  │ IdeaSynthCtlr     │   │
│                  │          │  │ GraphBuildCtlr    │   │
│                  │          │  │ SummaryCtlr       │   │
│                  │          │  └──────────────────┘   │
└──────────────────┘          └────────────────────────┘
                                       │
                                       ▼
                              ┌──────────────────┐
                              │   LLM Chains     │
                              │   (LangChain)    │
                              └──────────────────┘
```

### Controllers — Polling Architecture

Each stage has a `StageController` (abstract base) that:

- **Polls** `SessionStore.findByCurrentStage(stage)` every 500ms for sessions ready to process
- Tracks `inFlightSessions` Set to avoid re-entering a running session
- Calls `execute(session)` (implemented by subclass) which runs the LLM chain
- On completion calls `advance(sessionId, nextStage)` to move the session forward
- On error: stores error, marks session as `failed`, emits `run.failed`

Controllers (all under `apps/server/src/controllers/`):

| Controller | Chain Used | Description |
|---|---|---|
| `DeepResearchController` | `DeepResearchChain` | Multi-stage research: query gen → fact extraction → gap fill → analysis |
| `ExpertCreationController` | `ExpertCreationChain` | Generate expert profiles from research brief |
| `InsightRefinementController` | `InsightRefinementChain` | N rounds × M experts generating structured insights |
| `CrossReviewController` | `CrossReviewChain` | Each expert reviews all insights with 6-dimension scoring |
| `IdeaSynthesisController` | `IdeaSynthesisChain` | Synthesize startup ideas from insights + reviews |
| `GraphBuildController` | — (pure logic) | Build knowledge graph nodes/edges from session data |
| `SummaryController` | `SummaryChain` | Generate executive summary |

### LLM Chains

All chains use LangChain `RunnableSequence` with `PromptTemplate` + `withStructuredOutput(schema)`:

```
apps/server/src/chains/
├── deep-research-chain.ts       # 3-4 LLM calls with web search interleaved
├── expert-creation-chain.ts     # 1 LLM call → ExpertProfile[]
├── insight-refinement-chain.ts  # 1 LLM call per expert per round → Insight
├── cross-review-chain.ts        # 1 LLM call per reviewer → ReviewScore[]
├── idea-synthesis-chain.ts      # 1 LLM call → IdeaCandidate[]
├── summary-chain.ts             # 1 LLM call → SummaryDocument
```

### LLM Factory (`lib/llm.ts`)

- Reads per-stage provider config from `~/.neobee/neobee.json`
- Supports: `openai`, `anthropic`, `openrouter`
- Default: Anthropic `claude-sonnet-4-7`, temperature 0.7
- Caches LLM instances per (stage, provider, model) tuple
- Supports `baseURL` override for proxies / OpenRouter

### Session Store (`modules/sessions/sessions.store.ts`)

Dual-layer persistence:

- **In-memory** `Map<string, SessionAggregate>` for fast reads during polling
- **SQLite** (`~/.neobee/db/neobee.db`, WAL mode) for durable persistence

SQLite schema is split into per-stage SQL files under `lib/schema/`:

```
lib/schema/
├── system.sql                  # session, session_event, session_error
├── checkpoint.sql              # session_checkpoint
├── deep-research.sql           # deep_research_data + _task + _step
├── expert-creation.sql
├── insight-refinement.sql
├── cross-review.sql
├── idea-synthesis.sql
├── graph-build.sql
└── summary.sql
```

Each stage has three auxiliary tables: `{stage}_data` (JSON payload), `{stage}_task` (task record), `{stage}_step` (step records within a task).

### Real-time Communication

**EventBus** (`lib/event-bus.ts`): In-process pub/sub. Session-scoped subscriptions. Each event is recorded to SQLite by the store's recorder callback.

**WebSocket** (`websocket/ws-server.ts`): Single `subscribe_session` message type per connection. On subscription, sends full session state + event history, then pushes incremental updates. Clients reconnect independently.

**TaskTracker** (`lib/task-tracking.ts`): Tracks task/steps per session per stage. Emits progress (0–100) changes via EventBus for the frontend's progress indicators.

### Database Path

All data lives under `~/.neobee/`:
- `~/.neobee/neobee.json` — LLM provider config
- `~/.neobee/db/neobee.db` — SQLite database (WAL mode, foreign keys ON)

---

## Package: `@neobee/web`

React 18 + TypeScript + Vite 5, i18next (EN/ZH), CSS with dark/light theme support.

### Component Tree

```
App
├── SessionList              (sidebar — list + new session button)
├── StageNavBar              (stage navigation: 8 stages as tabs)
├── SessionOverview          (topic, current stage, stats)
├── Stage Card (conditional on selectedStage)
│   ├── TopicIntakeCard      (form: topic, rounds, experts, lang)
│   ├── ResearchCard         (research brief display + progress)
│   ├── ExpertsCard          (expert profiles with personas)
│   ├── InsightRefinementCard (rounds × experts insights)
│   ├── CrossReviewCard      (scoring matrix)
│   ├── IdeasCard            (startup ideas with scores)
│   ├── GraphBuildCard       (knowledge graph visualization)
│   └── SummaryCard          (executive summary)
├── ActivityRail
│   ├── EventFeed            (real-time event log)
│   └── StageGuide           (current stage guidance + progress)
├── ConfigSettings (modal)   (LLM provider configuration per stage)
└── Settings panel            (language toggle, dark/light, system)
```

### Data Flow

```
useSessions hook               (global state via React state)
  ├── fetch /api/sessions      (list on mount)
  ├── POST /api/sessions       (create + run)
  ├── GET /api/sessions/:id/state (poll on events)
  └── useSessionWebSocket      (subscribe_session → real-time push)
       └── handles: event, task.progress, session_state, session_events
```

The frontend is **event-driven**: WebSocket pushes drive state updates, which trigger re-renders of the relevant stage card. No manual refresh needed.

---

## Data Flow — Full Session Lifecycle

```
User submits topic
  │
  ▼
POST /api/sessions → SessionsService.createSession()
  │  - Creates session record (status: 'created')
  │  - On POST /api/sessions/:id/run: sets currentStage to 'deep_research'
  ▼
[Polling Loop — every 500ms]
  StageOrchestrator → finds sessions at current stage
  ▼
DeepResearchController.execute()
  ├── DeepResearchChain (3-4 LLM calls + web search)
  │   ├── Generate research queries
  │   ├── Search web (Tavily / DuckDuckGo / Mock)
  │   ├── Extract facts
  │   ├── Identify gaps → search again
  │   └── Synthesize final ResearchBrief
  └── advance() → expert_creation
  ▼
ExpertCreationController.execute()
  ├── ExpertCreationChain → ExpertProfile[]
  └── advance() → insight_refinement
  ▼
InsightRefinementController.execute()
  ├── For each round (1..N):
  │   └── For each expert (1..M):
  │       └── InsightRefinementChain → Insight
  └── advance() → cross_review
  ▼
CrossReviewController.execute()
  ├── For each expert (as reviewer):
  │   └── CrossReviewChain → ReviewScore[]
  └── advance() → idea_synthesis
  ▼
IdeaSynthesisController.execute()
  ├── IdeaSynthesisChain → IdeaCandidate[]
  └── advance() → graph_build
  ▼
GraphBuildController.execute()
  ├── Build GraphData (nodes + edges) from session data
  └── advance() → summary
  ▼
SummaryController.execute()
  ├── SummaryChain → SummaryDocument
  └── advance() → (terminal: status = 'completed')
```

Each stage emits typed events (`.started`, `.progress`, `.completed`) through EventBus → WebSocket → frontend.

---

## Key Design Decisions

1. **Polling over event-driven controllers**: Each stage controller polls the store at 500ms intervals rather than reacting to state changes. This is simpler (no async orchestration) and robust against transient failures — a crashed controller picks up on restart.

2. **Per-stage SQL tables**: Each stage gets its own `_{data,task,step}` tables. Data is stored as JSON blobs (`{stage}_data`), with separate normalized task/step tables for progress tracking. This avoids schema migrations as the data shapes evolve.

3. **Checkpointing enables resume**: `SessionCheckpoint` stores cursor positions (e.g., `insightRefinementCursor: { expertIndex, roundIndex }`) so a paused session can resume mid-stage.

4. **Decoupled EventBus**: The EventBus has no knowledge of the store or WebSocket — it just emits. The store registers as a recorder; the WebSocket server subscribes per-session. This makes testing each piece independently straightforward.

5. **LLM provider per stage**: `neobee.json` allows different models/providers per stage. Deep research might use a cheaper model, while insight refinement uses a stronger one.

---

## Configuration

`~/.neobee/neobee.json` example:

```json
{
  "providers": [
    {
      "stage": "default",
      "provider": "anthropic",
      "apiKey": "sk-...",
      "model": "claude-sonnet-4-7",
      "temperature": 0.7
    }
  ]
}
```

Per-stage overrides: match `stage` to any `SessionStage` value.

---

## Testing

No test infrastructure yet. Server test command is wired in root `package.json` but has no implementation.