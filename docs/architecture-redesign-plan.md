# Neobee 架构与产品设计优化计划

## 背景与目标

Neobee 当前已经具备本地化 AI 研究工作台的基本能力：多阶段研究流程、多会话管理、实时进度反馈、本地配置与 SQLite 落盘。但现有实现更接近“能跑通”的原型，还没有把可靠执行、状态一致性和结果阅读体验收敛到适合持续迭代的结构。

这次优化的目标有两个：

- 把后端执行链路收敛为可控、可恢复、可追溯的本地单机会话执行模型。
- 把前端收敛成一个真正的研究工作台，而不是简单的阶段卡片集合。

本次优化采用中等重构策略，保留现有技术栈和 workspace 结构，不引入外部队列、外部数据库或多用户系统。

## 当前问题

### 1. Stage 执行存在重入风险

当前各 stage controller 通过固定间隔轮询当前 stage 的 session。只要一次执行尚未完成，下一轮轮询仍可能再次命中同一 session，导致重复调用同一个 LLM stage。这个问题会直接破坏数据一致性，也会放大 token 成本。

### 2. 事件广播与事件历史分裂

运行时事件通过 `EventBus` 广播，但事件历史并没有稳定持久化到 `session_event`，导致 WebSocket 实时流和历史查询并不一致。结果是：前端能看到“刚刚发生了什么”，但刷新后无法完整恢复。

### 3. 任务进度模型是全局单例

`taskTracker` 目前以全局“当前 task”模型工作，并不区分 `sessionId + stage`。一旦两个 session 或两个阶段并发，任务状态和步骤记录就可能串线，前端进度条也会误报。

### 4. 前端状态管理集中在 `App.tsx`

`App.tsx` 同时承担了 session 列表、表单、WebSocket、任务进度、设置面板和阶段切换逻辑。这样会带来两个问题：

- 组件展示层和数据同步层强耦合。
- WebSocket 消息模型变化时，修复成本会快速上升。

### 5. 工作台信息层级不足

当前界面可以看到各阶段结果，但缺少研究工作台应有的层级：

- 当前会话处于什么阶段。
- 已经产出了什么。
- 下一步为什么重要。
- 这次运行都发生了哪些事件。

结果是信息完整但叙事弱，产品辨识度不够。

## 优化原则

- 保留本地单机形态，不引入 Redis、BullMQ、Postgres 或云端调度器。
- 保留现有 React、Vite、Express、SQLite、WebSocket、shared types 结构。
- 后端优先保证“同一 session 不重复执行、任务进度不串线、事件可追溯”。
- 前端优先保证“状态权威来源明确、刷新可恢复、阶段内容可解释”。
- 产品定位明确为“研究工作台”，不是轻量创意生成器，也不是纯 agent 运维控制台。

## 方案设计

### 后端执行架构

- 保留 `StageController` 作为阶段执行边界，但在 controller 内增加 per-session in-flight 锁。
- 同一个 stage 在同一时间只能执行同一个 session 一次；执行完成或失败后再释放。
- 错误由 stage controller 统一捕获，写入 `session_error`，同时把 session 置为 `failed`，阻止后续 stage 继续推进。
- `taskTracker` 改为以 `sessionId + stage` 为键跟踪活动任务，不再使用全局单一 `currentTaskId`。

### 事件与状态一致性

- `EventBus` 负责两件事：广播事件给订阅者，以及把事件写入 `session_event`。
- 所有运行期事件统一走 `emitRaw()`，避免出现“广播了但没有记录”的分叉路径。
- WebSocket 订阅某个 session 时，先返回最新 `session_state`，再返回 `session_events` 历史列表，随后推送增量 `event` 与 `task.progress`。
- WebSocket 每个 client 只订阅自己的 session 流，避免多个订阅者互相广播导致重复消息。

### Session API 与控制语义

- 保持已有 `GET /api/sessions`、`POST /api/sessions`、`GET /api/sessions/:id/state`、`POST /api/sessions/:id/run`。
- 新增 `GET /api/sessions/:id/events`，用于恢复事件历史和调试运行链路。
- 新增 `POST /api/sessions/:id/pause`、`resume`、`cancel`，先把 service 层和 API 层语义补齐，即使 UI 暂时不全部暴露，也保证运行控制是闭环的。
- `cancel` 会把当前 session 标记为 `failed`，清理 checkpoint，并落错误信息。

### 前端数据层

- 从 `App.tsx` 拆出 `useSessions()`，负责 session 列表、当前 session、错误状态、创建并启动 session。
- 拆出 `useSessionWebSocket()`，负责 WebSocket 连接、重连、订阅和消息分发。
- 拆出 `useTaskProgress()`，专门维护按 stage 聚合的运行进度。
- 建立统一 API client，集中处理 `/api/sessions`、`/api/events`、`/api/tasks` 请求和错误处理。

### 工作台信息架构

- 顶部 stage 导航不再只是步骤条，而是显示阶段名、运行状态、进度或产物数量。
- 当前 session 增加 overview 区域，展示当前主题、当前阶段、核心统计指标。
- 主工作区仍保留阶段卡片，但右侧新增 activity rail，承载最近事件和当前阶段说明。
- 阶段步骤历史改为复用一个 `TaskStepHistory` 组件，避免每张卡片重复维护分页和请求逻辑。

### 视觉系统

- 保留浅色专业工作台方向，但从通用蓝白面板风格切换到更有辨识度的“研究台”视觉。
- 使用新的颜色 token、背景渐变和更明确的面板层级，强化“结构化研究环境”的感受。
- 调整字体栈和卡片密度，减少默认 SaaS 感。

## 接口与类型调整

### 新增共享类型

```ts
type StageRunStatus = 'pending' | 'running' | 'completed' | 'failed' | 'skipped';
```

### 调整任务进度负载

`TaskProgressPayload` 增加：

- `sessionId`
- `updatedAt`
- `error?`

### 新增 API

- `GET /api/sessions/:id/events`
- `POST /api/sessions/:id/pause`
- `POST /api/sessions/:id/resume`
- `POST /api/sessions/:id/cancel`

### 保持兼容的现有 API

- `GET /api/sessions`
- `POST /api/sessions`
- `GET /api/sessions/:id/state`
- `POST /api/sessions/:id/run`
- `GET /api/sessions/:id/tasks/:stage`

## 实施阶段

### Phase 1: 后端可靠性修复

目标：消除重复执行、任务串线和事件丢失。

主要改动：

- `StageController` 加入 in-flight session 锁。
- `taskTracker` 改为按 `sessionId + stage` 跟踪。
- `EventBus` 接入持久化 recorder。
- 失败链路统一写入 `session_error`。

完成标准：

- 同一个 session 在同一 stage 不会重复执行。
- 多 session 并发时，task progress 不串线。
- 所有广播事件都能在事件历史中查回。

### Phase 2: 前端数据与交互重构

目标：让前端状态来源清晰、刷新可恢复、阶段视图可组合。

主要改动：

- 拆出 `useSessions()`、`useSessionWebSocket()`、`useTaskProgress()`。
- 建立统一 API client。
- 提炼 `TaskStepHistory` 组件复用任务步骤展示。
- 对齐 WebSocket 的 `session_state`、`session_events`、`event`、`task.progress` 消息模型。

完成标准：

- 页面刷新后可恢复当前 session 状态和事件历史。
- WebSocket 重连后不会重复订阅和重复渲染事件。
- `App.tsx` 只保留布局组合和轻量 UI 状态。

### Phase 3: 工作台体验与视觉收口

目标：让产品看起来像“研究工作台”，而不是阶段结果堆叠。

主要改动：

- 强化 stage nav 的状态、产物和进度表达。
- 增加 session overview 和 activity rail。
- 调整色彩、背景、排版和卡片层级。
- 补齐 i18n 缺失 key，减少散落 fallback。

完成标准：

- 用户能快速理解当前阶段、已产生内容和最近事件。
- 阶段导航、结果卡片、事件流形成一致的信息层级。
- 中英文切换无明显缺 key 残留。

## 验收与测试

### 后端验收

- 创建 session 后运行一次，只会进入一个 `deep_research` 执行实例。
- 两个 session 并发运行时，任务步骤与进度不会串线。
- 运行时事件和 `GET /api/sessions/:id/events` 返回结果一致。
- 任一 stage 失败后，session 状态进入 `failed`，且不会推进后续 stage。
- `pause`、`resume`、`cancel` API 的状态流转符合预期。

### 前端验收

- 新建 session 后能收到 `session_state` 初始快照。
- 刷新页面后，session 列表、当前状态和事件历史能恢复。
- WebSocket 断线重连后，不会重复收到同一条事件。
- 各阶段卡片能稳定展示任务步骤历史。
- 中英文切换无 `sessions`、`newSession`、`noSessions` 等缺 key 问题。

### 响应式与体验验收

- 桌面端可以同时查看 session 列表、stage 内容和事件流。
- 窄屏下布局退化为单列，不影响核心操作。
- 最终摘要页仍然是完整研究结果的交付面。

## 假设与边界

- 不迁移到完整 NestJS 应用框架。
- 不引入外部消息队列或分布式任务调度。
- 不实现多用户、权限或云端同步。
- 不在本轮重写为外部工作流引擎。
- 本轮重点是可靠性、可追溯性和工作台体验，不扩展新的研究阶段。
