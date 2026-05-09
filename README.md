# neobee

`neobee` 是一个面向创意探索和深度研究的本地化 AI 工作台。
它把一个主题拆成多个阶段：主题输入、深度检索、专家生成、观点精炼、交叉评审、创意合成、图谱构建和摘要输出，并通过 WebSocket 实时展示进度。

## 特性

- 多阶段研究工作流：围绕一个主题自动推进完整分析链路。
- 多会话管理：可以创建、查看和切换多个研究会话。
- 实时进度反馈：前端通过 WebSocket 订阅后端任务状态。
- 模型按阶段配置：不同阶段可以分别指定 LLM Provider、模型和 API Key。
- 本地数据落盘：配置和数据库默认保存在用户目录下的 `~/.neobee/`。
- 导出结果：支持将会话摘要导出为 Markdown。

## 项目结构

- `apps/web`：Vite + React 前端
- `apps/server`：Nest 风格的 Node.js/Express 后端
- `packages/shared`：前后端共享的 TypeScript 类型定义

## 技术栈

- 前端：React、Vite、TypeScript、i18next
- 后端：Express、WebSocket、TypeScript
- AI / 检索：LangChain、OpenAI、Anthropic、DuckDuckGo、Tavily
- 存储：SQLite（`better-sqlite3`）

## 运行要求

- Node.js 18+（建议 20+）
- npm 9+
- 可选：OpenAI / Anthropic / OpenRouter / Tavily API Key

## 安装

```bash
npm install
```

安装完成后，`packages/shared` 会自动构建，供前后端引用。

## 开发启动

```bash
npm run dev
```

默认会同时启动：

- 前端：`http://localhost:3000`
- 后端：`http://localhost:4001`

如果你只想启动某一部分：

```bash
npm run dev:web
npm run dev:server
```

## 构建

```bash
npm run build
```

## 测试与检查

```bash
npm run test
npm run lint
```

## 环境变量

### 后端

- `PORT`：后端 HTTP 端口，默认 `4001`
- `HOME`：用于定位 `~/.neobee/` 配置目录
- `OPENAI_API_KEY`：OpenAI 默认密钥
- `ANTHROPIC_API_KEY`：Anthropic 默认密钥
- `TAVILY_API_KEY`：可选搜索服务密钥
- `SEARCH_PROVIDER`：搜索提供方，默认 `duckduckgo`

### 前端

- `VITE_WS_URL`：WebSocket 地址，默认 `ws://localhost:4001`，仅用于订阅状态更新

## 配置文件

模型配置保存在：

```text
~/.neobee/neobee.json
```

示例结构：

```json
{
  "providers": [
    {
      "stage": "default",
      "provider": "anthropic",
      "apiKey": "your-api-key",
      "model": "claude-sonnet-4-7",
      "temperature": 0.7,
      "baseURL": ""
    }
  ]
}
```

前端的“Model Configuration”面板可以直接读写这个文件。

## 数据存储

默认数据目录：

```text
~/.neobee/db
```

数据库文件通常位于：

```text
~/.neobee/db/neobee.db
```

## API 概览

后端提供的核心接口包括：

- `GET /api/health`：健康检查
- `GET /api/config`：读取模型配置
- `PUT /api/config`：保存模型配置
- `GET /api/sessions`：会话列表
- `POST /api/sessions`：创建会话
- `GET /api/sessions/:id/state`：会话完整状态
- `GET /api/sessions/:id/export`：导出 Markdown
- `POST /api/sessions/:id/run`：通过 HTTP 启动会话流程

## 常见问题

- 如果前端连不上后端，先确认 `apps/server` 是否在 `4001` 端口运行。
- 如果 WebSocket 连接失败，检查 `VITE_WS_URL` 是否正确。
- 如果模型调用失败，检查 `~/.neobee/neobee.json` 中的 `apiKey` 和 `model` 配置。

## 许可证

当前仓库未显式声明许可证，如需开源发布，建议补充 `LICENSE` 文件。
