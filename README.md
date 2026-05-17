# NeoBee

AI 原生头脑风暴 CLI 工具。提交主题 → 4 阶段 deep agent 管线 → 结构化创业想法。

**Python + LangGraph + deepagents + typer**

## 特性

- **CLI 原生** — 命令行操作，无需浏览器
- **4 阶段 deep agent 管线** — 深度研究** — 深度研究 → 专家生成 → 多 agent 辩论 → 创意合成
- **多 agent 辩论** — 洞察凝练阶段使用 1 个 Facilitator Agent + N 个 Expert Agent 进行 3 轮辩论（发散→挑战→综合）
- **模型按阶段配置** — 不同阶段可指定不同 LLM Provider、模型和 API Key
- **文件系统存储** — 无需数据库，每个 session 独立目录，输出 markdown + JSON
- **LangGraph 编排** — 条件边路由处理错误

## 技术栈

| 层 | 技术 |
|---|---|
| CLI | typer |
| 管线编排 | LangGraph (StateGraph) |
| AI / LLM | LangChain + Anthropic / OpenAI / OpenRouter |
| Deep Agent | deepagents |
| 搜索 | DuckDuckGo / Tavily / LLM |
| 数据验证 | Pydantic v2 |
| 存储 | 文件系统 (markdown + JSON) |
| 构建 | uv (pyproject.toml) |

## 项目结构

```
neobee/
├── __main__.py              # CLI 入口: python -m neobee
├── cli/
│   ├── app.py               # typer 主程序 (run / session 命令)
│   └── session_cmd.py       # session list / show
├── core/
│   ├── config.py             # ~/.neobee/neobee.json 配置
│   ├── llm.py                # LLM 工厂 (Anthropic/OpenAI)
│   └── search.py             # 搜索 (DuckDuckGo/Tavily/LLM)
├── models/__init__.py        # Pydantic v2 数据模型
├── pipeline/
│   ├── graph.py              # LangGraph 4 节点串行管线
│   ├── state.py              # NeobeeState TypedDict
│   ├── agents/
│   │   ├── _utils.py         # extract_json 共享函数
│   │   ├── research_agent.py # 深度研究 agent (有搜索工具)
│   │   ├── expert_agent.py   # 专家生成 agent
│   │   ├── insight_agent.py  # 洞察凝练 agent (多 agent 辩论)
│   │   └── idea_agent.py     # 想法合成 agent
│   └── tools/
│       └── search.py         # web_search_tool / fetch_url_tool
└── storage/
    └── session.py            # 文件系统 session 读写
```

## 快速开始

### 环境要求

- Python 3.12+
- 可选：Anthropic / OpenAI / OpenRouter / Tavily API Key

### 安装

```bash
cd neobee
uv sync
```

### 配置

```bash
# 编辑 ~/.neobee/neobee.json
{
  "providers": [
    { "stage": "default", "provider": "anthropic", "model": "claude-sonnet-4-7", "temperature": 0.7 }
  ],
  "search_provider": "duckduckgo"
}
```

支持按阶段独立配置：

```json
{
  "providers": [
    { "stage": "default", "provider": "anthropic", "model": "claude-sonnet-4-7", "temperature": 0.7 },
    { "stage": "deep_research", "provider": "openai", "model": "gpt-4o", "temperature": 0.5 }
  ]
}
```

### 使用

```bash
# 一键运行完整管线
neobee run "AI for Education" --experts 3 --rounds 3

# 查看历史 session
neobee session list

# 查看 session 详情
neobee session show <name>
```

运行示例输出：

```
Session: ai-for-education-3-3-20260517-1430

  [research] Starting...
  [research] Research brief saved
  [experts] Starting...
  [experts] 3 experts saved
  [insight] Starting...
  [insight] 3 final insights saved
  [ideas] Starting...
  [ideas] 6 ideas saved

━━ Results ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Session: ai-for-education-3-3-20260517-1430
Status: completed
Duration: 142.3s

Top Ideas:
  1. [8.7/10] AI-Personalized Homework Engine
  2. [8.2/10] Classroom Discussion Facilitator

Output: ~/.neobee/sessions/ai-for-education-3-3-20260517-1430/
```

## 管线阶段

| 阶段 | Agent 类型 | 说明 |
|------|-----------|------|
| deep_research | Research Agent (有搜索工具) | 自主多轮 Web 搜索 → 研究简报 + 机会地图 |
| expert_creation | Expert Agent | 根据研究简报生成多样化专家画像 |
| insight_refinement | Facilitator + N × Expert Agent | 3 轮辩论：发散 → 跨领域挑战 → 综合 |
| idea_synthesis | Idea Agent | 生成 → 自评 → 过滤 → 精炼 → 排序 |

## 管线图

```
deep_research → expert_creation → insight_refinement → idea_synthesis → 完成
     ↓ error        ↓ error      ↓ error           ↓ error           ↓ error
     └────────────────────── END ──────────────────────────────┘
```

## 存储结构

每个 session 独立目录，无数据库：

```
~/.neobee/
  sessions/
    {topic}-{experts}-{rounds}-{timestamp}/
      session.json              # 元数据
      research/report.md        # 研究简报（全文）
      experts/                  # 每个专家独立文件
        {name}.md
        ...
      insights/                 # 每条洞察独立文件，以专家名命名
        {name}.md
        ...
      ideas/                    # 每个创意独立文件（按评分排序）
        {rank}-{title}.md
        ...
```

## API 概览

```python
from neobee.models import SessionMeta
from neobee.storage.session import create_session_dir, write_session_meta, list_session_dirs
from neobee.pipeline.graph import run_pipeline

# 创建 session
path, name = create_session_dir("AI for Education", 3, 3)
meta = SessionMeta(topic="AI for Education", expert_count=3, round_count=3)
write_session_meta(path, meta)

# 运行管线
result = await run_pipeline(str(path), meta)

# 列出 session
sessions = list_session_dirs()
```

## 开发

```bash
uv run python -c "from neobee.models import *; print('OK')"
uv add <package>
```

## 常见问题

- **API 限流**：`deepagents` 库内部多层 middleware 可能消耗较多 token，可通过设置不同 provider 或降低并发缓解
- **Agent 输出格式**：部分 LLM 偶尔输出自然语言而非 JSON。已内置多策略 JSON 提取（```json 块 → ``` 块 → 平衡括号匹配）
- **搜索无结果**：DuckDuckGo 无需 Key；Tavily 需在配置中设置 `search_api_key`