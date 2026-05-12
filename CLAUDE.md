# NeoBee (Python)

AI 原生头脑风暴平台。用户提交主题 → 多阶段 LLM 管线 → 结构化创业想法。

Python + LangChain + LangGraph + Streamlit 实现。

## Tech Stack

- **Frontend**: Streamlit 1.57+ (plain, no component libraries)
- **Pipeline**: LangGraph 1.1+ (StateGraph, MemorySaver, async nodes)
- **AI**: LangChain 1.2 (Anthropic, OpenAI, OpenRouter)
- **Search**: DuckDuckGo, Tavily, LLM-based
- **Models**: Pydantic v2 (all data types)
- **Storage**: SQLite (Python `sqlite3`, WAL mode)
- **Concurrency**: asyncio
- **Build**: uv 0.11+ (pyproject.toml)

## Project Structure

```
neobee-py/
  app.py                 — Streamlit 入口
  neobee/
    models/              — Pydantic 数据模型包
    core/                — 基础设施 (config/db/llm/search)
    pipeline/            — LangGraph 管线 (state/graph/nodes/task_tracker)
    webui/               — Streamlit UI (components/pages)
```

## Key Architecture

- **LangGraph 有向图编排**: StateGraph 替代 EventBus + StageOrchestrator
- **异步节点执行**: asyncio 替代 worker_threads 做并发 LLM 调用
- **条件边路由**: 每个节点后根据 error/paused 路由到下一阶段或 fail_session
- **SQLite 持久化**: 阶段数据 → SQLite, Checkpoint → SQLite
- **Streamlit 轮询**: `st.fragment` / `time.sleep + st.rerun` 替代 WebSocket

## Pipeline Stages

1. topic_intake — 表单输入（前端）
2. deep_research — 查询生成 → 搜索1 → 事实提取 → 搜索2 → 综合
3. expert_creation — LLM 生成专家画像
4. insight_refinement — 每位专家每轮生成洞见
5. cross_review — 6 维度交叉评审
6. idea_synthesis — 批量生成创业创意

## Import 约定

- 所有模块使用**绝对路径导入**（如 `from neobee.core.llm import get_llm`）
- 禁止使用相对导入（`from ..xxx import ...`）
- 模块间依赖关系：`models` ← `core` ← `pipeline` ← `webui`

## Coding Conventions

- Python 3.12+ type hints, `from __future__ import annotations`
- Pydantic v2 models for all data types
- asyncio for all LLM/IO calls
- Plain Streamlit (no extra component libraries)
- CSS: `.streamlit/config.toml` for theming
- SQL: WAL mode, foreign keys ON, thread-local connections

## Commands

- `uv run streamlit run app.py` — 启动 Web UI (port 8501)
- `uv sync` — 安装/更新依赖
- `uv add <package>` — 添加新依赖
- `uv run python3 -c "from neobee.models import *; print('OK')"` — 验证导入

## Environment

- `ANTHROPIC_API_KEY` — Anthropic 默认密钥
- `OPENAI_API_KEY` — OpenAI 默认密钥
- `TAVILY_API_KEY` — Tavily 搜索密钥
- `SEARCH_PROVIDER` — 搜索提供方 (duckduckgo/tavily/llm)
- `NEOBEE_DATA_DIR` — 配置目录，默认 `~/.neobee`

## Config

`~/.neobee/neobee.json` — LLM provider + search 配置。支持按阶段设置不同模型。

## Important Rules

- **Never use relative imports** — always absolute paths from `neobee.`
- **Never add new files without wrapping in a subdirectory** — `core/`, `pipeline/`, `webui/`, `models/` only
- **Keep imports clean** — `from neobee.core.db import get_db` not `from neobee.core import db`
- **All async functions must use `await`** — no sync blocking in pipeline nodes
- **DB writes after every pipeline step** — for crash recovery