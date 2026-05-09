import express from 'express';
import { createServer } from 'http';
import fs from 'fs';
import { SessionsService } from './modules/sessions/sessions.service.js';
import { SessionStore } from './modules/sessions/sessions.store.js';
import { EventBus } from './lib/event-bus.js';
import { StageOrchestrator } from './controllers/orchestrator.js';
import { createWebSocketServer } from './websocket/ws-server.js';
import { taskTracker } from './lib/task-tracking.js';
import type { CreateSessionInput, SessionStage } from '@neobee/shared';

const HTTP_PORT = Number(process.env.PORT) || 4001;

const eventBus = new EventBus();
const store = new SessionStore();
eventBus.setRecorder((event) => {
  store.appendEvent(event.sessionId, event);
});

const sessionsService = new SessionsService(store, eventBus);
const orchestrator = new StageOrchestrator(store, eventBus);
orchestrator.startAll();

taskTracker.setProgressListener((progress) => {
  eventBus.emitRaw(progress.sessionId, 'task.progress', progress.stage, progress);
});

const app = express();
app.use(express.json());

app.use((_req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  next();
});

app.options('*', (_req, res) => res.sendStatus(200));

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', service: 'neobee-server' });
});

app.get('/api/config', (_req, res) => {
  try {
    const configPath = `${process.env.HOME}/.neobee/neobee.json`;
    if (fs.existsSync(configPath)) {
      const content = fs.readFileSync(configPath, 'utf-8');
      res.json(JSON.parse(content));
      return;
    }

    res.json({ providers: [] });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Unknown error' });
  }
});

app.put('/api/config', (req, res) => {
  try {
    const configPath = `${process.env.HOME}/.neobee/neobee.json`;
    const configDir = `${process.env.HOME}/.neobee`;

    if (!fs.existsSync(configDir)) {
      fs.mkdirSync(configDir, { recursive: true });
    }

    fs.writeFileSync(configPath, JSON.stringify(req.body, null, 2), 'utf-8');
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Unknown error' });
  }
});

app.get('/api/sessions', (_req, res) => {
  res.json(sessionsService.listSessions());
});

app.post('/api/sessions', (req, res) => {
  try {
    const input = req.body as CreateSessionInput;
    const aggregate = sessionsService.createSession(input);
    res.status(201).json(aggregate);
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'Unknown error' });
  }
});

app.get('/api/sessions/:id/state', (req, res) => {
  try {
    const aggregate = sessionsService.getSessionState(req.params.id);
    res.json(aggregate);
  } catch (err) {
    res.status(404).json({ error: err instanceof Error ? err.message : 'Not found' });
  }
});

app.get('/api/sessions/:id/events', (req, res) => {
  try {
    res.json(sessionsService.getEvents(req.params.id));
  } catch (err) {
    res.status(404).json({ error: err instanceof Error ? err.message : 'Not found' });
  }
});

app.get('/api/sessions/:id/graph', (req, res) => {
  try {
    res.json(sessionsService.getGraph(req.params.id));
  } catch (err) {
    res.status(404).json({ error: err instanceof Error ? err.message : 'Not found' });
  }
});

app.get('/api/sessions/:id/summary', (req, res) => {
  try {
    res.json(sessionsService.getSummary(req.params.id));
  } catch (err) {
    res.status(404).json({ error: err instanceof Error ? err.message : 'Not found' });
  }
});

app.get('/api/sessions/:id/export', (req, res) => {
  try {
    const aggregate = sessionsService.getSessionState(req.params.id);
    const lines = [
      `# ${aggregate.session.topic}`,
      '',
      '## Best Ideas',
      ...(aggregate.summary?.bestIdeas ?? []).map((item) => `- ${item}`),
      '',
      '## Controversial Ideas',
      ...(aggregate.summary?.controversialIdeas ?? []).map((item) => `- ${item}`),
      '',
      '## Unresolved Questions',
      ...(aggregate.summary?.unresolvedQuestions ?? []).map((item) => `- ${item}`)
    ];
    res.header('Content-Type', 'text/markdown; charset=utf-8');
    res.send(lines.join('\n'));
  } catch (err) {
    res.status(404).json({ error: err instanceof Error ? err.message : 'Not found' });
  }
});

app.post('/api/sessions/:id/run', (req, res) => {
  try {
    const result = sessionsService.runSession(req.params.id);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'Unknown error' });
  }
});

app.post('/api/sessions/:id/pause', (req, res) => {
  try {
    res.json(sessionsService.pauseSession(req.params.id));
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'Unknown error' });
  }
});

app.post('/api/sessions/:id/resume', (req, res) => {
  try {
    res.json(sessionsService.resumeSession(req.params.id));
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'Unknown error' });
  }
});

app.post('/api/sessions/:id/cancel', (req, res) => {
  try {
    res.json(sessionsService.cancelSession(req.params.id));
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'Unknown error' });
  }
});

app.post('/api/sessions/:id/retry', (req, res) => {
  try {
    const result = sessionsService.retrySession(req.params.id);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'Unknown error' });
  }
});

app.delete('/api/sessions/:id', (req, res) => {
  try {
    sessionsService.deleteSession(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(404).json({ error: err instanceof Error ? err.message : 'Not found' });
  }
});

app.get('/api/sessions/:id/tasks/:stage', (req, res) => {
  try {
    const { id, stage } = req.params;
    const page = parseInt(req.query.page as string, 10) || 1;
    const pageSize = parseInt(req.query.pageSize as string, 10) || 20;
    const result = sessionsService.getTaskWithSteps(id, stage as SessionStage, page, pageSize);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Unknown error' });
  }
});

const httpServer = createServer(app);
httpServer.listen(HTTP_PORT, () => {
  console.log(`HTTP server running on http://localhost:${HTTP_PORT}/api`);
  console.log('Stage controllers started (orchestrator)');
});

createWebSocketServer(sessionsService, eventBus, httpServer);

process.on('SIGTERM', () => {
  orchestrator.stopAll();
  httpServer.close();
});
