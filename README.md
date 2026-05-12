# NeoBee 🐝

AI 原生头脑风暴平台 — 用户提交主题，多阶段 LLM 管线自动推进，输出结构化创业想法。

**Python + LangChain + LangGraph + Streamlit** 重构版。

---

## 特性

- **多阶段研究管线**：6 个阶段自动推进 — 深度研究 → 专家生成 → 洞见精炼 → 交叉评审 → 创意合成
- **多会话管理**：创建、查看、切换多个研究会话，支持暂停/恢复
- **实时进度反馈**：Streamlit 自动轮询，每 2 秒刷新任务进度
- **模型按阶段配置**：不同阶段可分别指定 LLM Provider、模型和 API Key
- **LangGraph 有向图编排**：条件边路由处理错误/暂停，内置 Checkpoint 支持恢复
- **本地数据落盘**：SQLite 存储，配置位于 `~/.neobee/neobee.json`

## 技术栈

| 层 | 技术 |
|---|---|
| 前端 | Streamlit 1.57+ |
| 管线编排 | LangGraph 1.1+ (StateGraph + MemorySaver) |
| AI / LLM | LangChain 1.2 + Anthropic / OpenAI / OpenRouter |
| 搜索 | DuckDuckGo / Tavily / LLM-based |
| 数据验证 | Pydantic v2 |
| 存储 | SQLite (Python `sqlite3`) |
| 并发 | asyncio |
| 构建 | uv 0.11+ (pyproject.toml)

## 项目结构

```
neobee-py/
├── app.py                          # Streamlit 入口
├── requirements.txt                # Python 依赖
├── .env.example                    # 环境变量模板
├── .streamlit/config.toml          # Streamlit 主题配置
│
└── neobee/
    ├── __init__.py
    ├── models/                     # 数据模型层
    │   └── __init__.py             # Pydantic 模型（15+ 类型）
    ├── core/                       # 核心基础设施
    │   ├── config.py               # ~/.neobee/neobee.json 读写
    │   ├── db.py                   # SQLite CRUD（20+ 函数）
    │   ├── llm.py                  # LLM 提供商工厂（Anthropic/OpenAI/OpenRouter）
    │   └── search.py               # 搜索工具（DuckDuckGo/Tavily/LLM）
    ├── pipeline/                   # LangGraph 管线
    │   ├── state.py                # NeobeeState TypedDict
    │   ├── task_tracker.py         # 任务进度追踪
    │   ├── graph.py                # StateGraph + Orchestrator
    │   └── nodes/                  # 管线阶段节点
    │       ├── deep_research.py    # 5 子阶段深度研究
    │       ├── expert_creation.py  # LLM 生成专家画像
    │       ├── insight_refinement.py # 逐专家逐轮生成洞见
    │       ├── cross_review.py     # 6 维度交叉评审
    │       └── idea_synthesis.py   # 批量生成创业想法
    └── webui/                      # Streamlit 前端
        ├── components.py           # 可复用 UI 组件
        └── pages/
            └── sessions.py         # 主会话页面
```

## 快速开始

### 环境要求

- Python 3.12+
- 可选：Anthropic / OpenAI / OpenRouter / Tavily API Key

### 安装

```bash
# 克隆项目
cd neobee

# 安装依赖（自动创建 .venv）
uv sync

# 激活环境
source .venv/bin/activate
```

### 配置

模型配置保存在 `~/.neobee/neobee.json`，也可通过 `.env` 文件提供默认密钥：

```bash
cp .env.example .env
# 编辑 .env，填入你的 API Key
```

示例配置结构：

```json
{
  "providers": [
    {
      "stage": "default",
      "provider": "anthropic",
      "model": "claude-sonnet-4-7",
      "temperature": 0.7,
      "apiKey": "sk-ant-..."
    }
  ],
  "searchProvider": "duckduckgo"
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

### 启动

```bash
uv run streamlit run app.py
# 或先激活环境再运行：
# source .venv/bin/activate
# streamlit run app.py
```

默认访问 `http://localhost:8501`。

## 管线阶段

| 阶段 | 说明 | LLM 调用 |
|---|---|---|
| topic_intake | 表单输入主题 | 无 |
| deep_research | Web 搜索 + 事实提取 + 综合 | 3 次 LLM + 2 轮搜索 |
| expert_creation | 生成多样化专家画像 | 1 次 LLM (结构化输出) |
| insight_refinement | 每位专家每轮生成洞见 | N × R 次 LLM |
| cross_review | 专家互评（6 维度打分） | E × ceil(I/20) 次 LLM |
| idea_synthesis | 批量生成创业创意 | ceil(I/20) 次 LLM |

- N = 专家数, R = 轮次数, E = 专家数, I = 洞见总数

## LangGraph 管线图

```
deep_research → expert_creation → insight_refinement → cross_review → idea_synthesis → complete_session
     ↓ error         ↓ error            ↓ error              ↓ error         ↓ error
     └──→ fail_session ←────────────────────────────────────────────────────────────┘
```

- 每个节点是 async 函数
- 条件边根据 `error` / `paused` 路由到下一阶段、暂停或失败处理
- MemorySaver 提供节点级 Checkpoint

## API 概览

Python 项目无 HTTP API（Streamlit 直接调用后端模块）。核心编程接口：

```python
from neobee.models import SessionRecord, CreateSessionInput
from neobee.core.db import create_session, get_aggregate
from neobee.pipeline.graph import Orchestrator

# 创建会话
session = SessionRecord(topic="AI for education", round_count=3, expert_count=3)
create_session(session)

# 启动管线
orch = Orchestrator()
await orch.start_session(session.id)

# 读取聚合状态
agg = get_aggregate(session.id)
print(agg.research_brief.topic_frame)
```

## 开发

```bash
# 验证导入
uv run python3 -c "from neobee.models import *; from neobee.core import *; from neobee.pipeline import *; print('OK')"

# 添加新依赖
uv add <package>

# 清理数据
rm -rf data/
```

## 常见问题

- **Streamlit 不显示进度**：检查后台是否有 asyncio 事件循环冲突，`_run_async()` 会自适应处理
- **模型调用失败**：检查 `~/.neobee/neobee.json` 中的 API Key 和模型名称
- **搜索无结果**：DuckDuckGo 无需 Key；Tavily 需在配置中设置 `searchApiKey`
- **数据库损坏**：删除 `data/neobee.db` 后重启即可重建

## 致谢

- 原始 TypeScript 版本由 NeoBee 团队开发
- LangGraph 提供管线编排能力
- Streamlit 提供快速 UI 开发体验