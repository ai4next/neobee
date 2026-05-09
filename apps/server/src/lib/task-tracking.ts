import { getDb } from './db.js';
import type { SessionStage, StageRunStatus, TaskProgressPayload } from '@neobee/shared';

export interface TaskRecord {
  id: string;
  sessionId: string;
  status: Extract<StageRunStatus, 'pending' | 'running' | 'completed' | 'failed'>;
  progress: number;
  createdAt: string;
  updatedAt: string;
}

export interface StepRecord {
  id: string;
  taskId: string;
  name: string;
  data: string;
  createdAt: string;
  updatedAt: string;
}

export type TaskProgressCallback = (event: TaskProgressPayload) => void;

type TaskTableName =
  | 'topic_intake_task'
  | 'deep_research_task'
  | 'expert_creation_task'
  | 'insight_refinement_task'
  | 'cross_review_task'
  | 'idea_synthesis_task';

type StepTableName =
  | 'topic_intake_step'
  | 'deep_research_step'
  | 'expert_creation_step'
  | 'insight_refinement_step'
  | 'cross_review_step'
  | 'idea_synthesis_step';

interface TaskContext {
  taskId: string;
  sessionId: string;
  stage: SessionStage;
}

const TASK_TABLE_MAP: Record<SessionStage, TaskTableName> = {
  topic_intake: 'topic_intake_task',
  deep_research: 'deep_research_task',
  expert_creation: 'expert_creation_task',
  insight_refinement: 'insight_refinement_task',
  cross_review: 'cross_review_task',
  idea_synthesis: 'idea_synthesis_task'
};

const STEP_TABLE_MAP: Record<SessionStage, StepTableName> = {
  topic_intake: 'topic_intake_step',
  deep_research: 'deep_research_step',
  expert_creation: 'expert_creation_step',
  insight_refinement: 'insight_refinement_step',
  cross_review: 'cross_review_step',
  idea_synthesis: 'idea_synthesis_step'
};

function contextKey(sessionId: string, stage: SessionStage): string {
  return `${sessionId}:${stage}`;
}

export class TaskTracker {
  private readonly activeTasks = new Map<string, TaskContext>();
  private onTaskProgress: TaskProgressCallback | null = null;

  setProgressListener(callback: TaskProgressCallback): void {
    this.onTaskProgress = callback;
  }

  createTask(sessionId: string, stage: SessionStage): TaskRecord {
    const db = getDb();
    const taskId = crypto.randomUUID();
    const now = new Date().toISOString();
    const taskTable = TASK_TABLE_MAP[stage];

    db.prepare(`
      INSERT INTO ${taskTable} (id, session_id, status, progress, created_at, updated_at)
      VALUES (?, ?, 'running', 0, ?, ?)
    `).run(taskId, sessionId, now, now);

    this.activeTasks.set(contextKey(sessionId, stage), { taskId, sessionId, stage });
    this.emitProgress({
      sessionId,
      stage,
      taskId,
      status: 'running',
      progress: 0,
      updatedAt: now
    });

    return {
      id: taskId,
      sessionId,
      status: 'running',
      progress: 0,
      createdAt: now,
      updatedAt: now
    };
  }

  createStep(sessionId: string, stage: SessionStage, name: string, data: Record<string, unknown> = {}): StepRecord | null {
    const context = this.activeTasks.get(contextKey(sessionId, stage));
    if (!context) {
      return null;
    }

    const db = getDb();
    const stepId = crypto.randomUUID();
    const now = new Date().toISOString();
    const stepTable = STEP_TABLE_MAP[stage];

    db.prepare(`
      INSERT INTO ${stepTable} (id, task_id, name, data, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(stepId, context.taskId, name, JSON.stringify(data), now, now);

    const progress = this.getProgressFromStepName(name);
    this.updateTaskProgress(sessionId, stage, progress);
    this.emitProgress({
      sessionId,
      stage,
      taskId: context.taskId,
      status: 'running',
      progress,
      updatedAt: now,
      currentStep: { name, data }
    });

    return {
      id: stepId,
      taskId: context.taskId,
      name,
      data: JSON.stringify(data),
      createdAt: now,
      updatedAt: now
    };
  }

  updateTaskProgress(sessionId: string, stage: SessionStage, progress: number): void {
    const context = this.activeTasks.get(contextKey(sessionId, stage));
    if (!context) {
      return;
    }

    const db = getDb();
    const now = new Date().toISOString();
    const taskTable = TASK_TABLE_MAP[stage];

    db.prepare(`
      UPDATE ${taskTable} SET progress = ?, updated_at = ? WHERE id = ?
    `).run(progress, now, context.taskId);

    this.emitProgress({
      sessionId,
      stage,
      taskId: context.taskId,
      status: 'running',
      progress,
      updatedAt: now
    });
  }

  completeTask(
    sessionId: string,
    stage: SessionStage,
    status: Extract<StageRunStatus, 'completed' | 'failed'> = 'completed',
    error?: string
  ): void {
    const context = this.activeTasks.get(contextKey(sessionId, stage));
    if (!context) {
      return;
    }

    const db = getDb();
    const now = new Date().toISOString();
    const taskTable = TASK_TABLE_MAP[stage];

    db.prepare(`
      UPDATE ${taskTable} SET status = ?, progress = 100, updated_at = ? WHERE id = ?
    `).run(status, now, context.taskId);

    this.emitProgress({
      sessionId,
      stage,
      taskId: context.taskId,
      status,
      progress: 100,
      updatedAt: now,
      ...(error ? { error } : {})
    });

    this.activeTasks.delete(contextKey(sessionId, stage));
  }

  getTask(sessionId: string, stage: SessionStage): TaskRecord | null {
    const db = getDb();
    const taskTable = TASK_TABLE_MAP[stage];

    const row = db.prepare(`
      SELECT id, session_id as sessionId, status, progress, created_at as createdAt, updated_at as updatedAt
      FROM ${taskTable}
      WHERE session_id = ?
      ORDER BY created_at DESC
      LIMIT 1
    `).get(sessionId) as TaskRecord | undefined;

    return row || null;
  }

  getSteps(taskId: string, stage: SessionStage): StepRecord[] {
    const db = getDb();
    const stepTable = STEP_TABLE_MAP[stage];

    return db.prepare(`
      SELECT id, task_id as taskId, name, data, created_at as createdAt, updated_at as updatedAt
      FROM ${stepTable}
      WHERE task_id = ?
      ORDER BY created_at ASC
    `).all(taskId) as StepRecord[];
  }

  private emitProgress(event: TaskProgressPayload): void {
    this.onTaskProgress?.(event);
  }

  private getProgressFromStepName(name: string): number {
    if (name === 'completed') return 100;
    if (name.startsWith('round_') && name.includes('completed')) return 90;
    if (name.startsWith('round_') && name.includes('started')) return 20;
    return 50;
  }
}

export const taskTracker = new TaskTracker();
