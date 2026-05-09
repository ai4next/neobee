import express from 'express';
import { createServer } from 'http';
import { SessionsService } from './modules/sessions/sessions.service.js';
import { SessionStore } from './modules/sessions/sessions.store.js';
import { EventBus } from './lib/event-bus.js';
import { StageOrchestrator } from './controllers/orchestrator.js';
import { createWebSocketServer } from './websocket/ws-server.js';
import { taskTracker } from './lib/task-tracking.js';
import { logger } from './lib/logger.js';
import { errorHandler } from './middleware/error-handler.js';
import { requestLogger } from './middleware/request-logger.js';
import { healthRouter } from './routes/health.routes.js';
import { configRouter } from './routes/config.routes.js';
import { createSessionsRouter } from './routes/sessions.routes.js';

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

app.use('/api/health', healthRouter);
app.use(requestLogger);
app.use('/api/config', configRouter);
app.use('/api/sessions', createSessionsRouter(sessionsService));

app.use(errorHandler);

const httpServer = createServer(app);
httpServer.listen(HTTP_PORT, () => {
  logger.info(`HTTP server running on http://localhost:${HTTP_PORT}/api`);
  logger.info('Stage controllers started (orchestrator)');
});

createWebSocketServer(sessionsService, eventBus, httpServer);

process.on('SIGTERM', () => {
  orchestrator.stopAll();
  httpServer.close();
});
