import { Router } from 'express';
import { z } from 'zod';
import type { CreateSessionInput, SessionStage } from '@neobee/shared';
import type { SessionsService } from '../modules/sessions/sessions.service.js';
import { wrap } from '../middleware/async-handler.js';
import { validate } from '../middleware/validate.js';

const createSessionSchema = z.object({
  topic: z.string().min(1, 'Topic is required').max(500),
  roundCount: z.number().int().min(1).max(10).default(3),
  expertCount: z.number().int().min(1).max(10).default(3),
  additionalInfo: z.string().max(2000).optional().default(''),
  language: z.enum(['en', 'zh']).optional().default('en')
});

export function createSessionsRouter(sessionsService: SessionsService): Router {
  const router = Router();

  router.get(
    '/',
    wrap(async (_req, res) => {
      res.json(sessionsService.listSessions());
    })
  );

  router.post(
    '/',
    validate(createSessionSchema),
    wrap(async (req, res) => {
      const aggregate = sessionsService.createSession(req.body as CreateSessionInput);
      res.status(201).json(aggregate);
    })
  );

  router.get(
    '/:id/state',
    wrap(async (req, res) => {
      const aggregate = sessionsService.getSessionState(String(req.params.id));
      res.json(aggregate);
    })
  );

  router.get(
    '/:id/events',
    wrap(async (req, res) => {
      res.json(sessionsService.getEvents(String(req.params.id)));
    })
  );

  router.get(
    '/:id/export',
    wrap(async (req, res) => {
      const aggregate = sessionsService.getSessionState(String(req.params.id));
      const lines = [
        `# ${aggregate.session.topic}`,
        '',
        ...aggregate.experts.map((e) => `- **${e.name}** — ${e.domain} (${e.stance})`),
        '',
        '## Ideas',
        ...aggregate.ideas.map((idea, i) => [
          `### ${i + 1}. ${idea.title}`,
          idea.thesis,
          `Target: ${idea.targetUser} | Score: ${idea.totalScore}`,
          ...(idea.risks.length ? ['', 'Risks:', ...idea.risks.map((r) => `- ${r}`)] : []),
        ].join('\n')),
      ];
      res.header('Content-Type', 'text/markdown; charset=utf-8');
      res.send(lines.join('\n'));
    })
  );

  router.post(
    '/:id/run',
    wrap(async (req, res) => {
      const result = sessionsService.runSession(String(req.params.id));
      res.json(result);
    })
  );

  router.post(
    '/:id/pause',
    wrap(async (req, res) => {
      res.json(sessionsService.pauseSession(String(req.params.id)));
    })
  );

  router.post(
    '/:id/resume',
    wrap(async (req, res) => {
      res.json(sessionsService.resumeSession(String(req.params.id)));
    })
  );

  router.post(
    '/:id/cancel',
    wrap(async (req, res) => {
      res.json(sessionsService.cancelSession(String(req.params.id)));
    })
  );

  router.post(
    '/:id/retry',
    wrap(async (req, res) => {
      const result = sessionsService.retrySession(String(req.params.id));
      res.json(result);
    })
  );

  router.delete(
    '/:id',
    wrap(async (req, res) => {
      sessionsService.deleteSession(String(req.params.id));
      res.json({ success: true });
    })
  );

  router.get(
    '/:id/tasks/:stage',
    wrap(async (req, res) => {
      const id = String(req.params.id);
      const stage = String(req.params.stage);
      const page = parseInt(req.query.page as string, 10) || 1;
      const pageSize = parseInt(req.query.pageSize as string, 10) || 20;
      const result = sessionsService.getTaskWithSteps(id, stage as SessionStage, page, pageSize);
      res.json(result);
    })
  );

  return router;
}