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

type TaskTableName = 'stage_task';
type StepTableName = 'stage_step';

interface TaskContext {
  taskId: string;
  sessionId: string;
  stage: SessionStage;
}

const TASK_TABLE = 'stage_task' as const;
const STEP_TABLE = 'stage_step' as const;

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
    const taskTable = TASK_TABLE;

    db.prepare(`
      INSERT INTO ${taskTable} (id, session_id, stage, status, progress, created_at, updated_at)
      VALUES (?, ?, ?, 'running', 0, ?, ?)
    `).run(taskId, sessionId, stage, now, now);

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
    const stepTable = STEP_TABLE;

    db.prepare(`
      INSERT INTO ${stepTable} (id, task_id, stage, name, data, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(stepId, context.taskId, stage, name, JSON.stringify(data), now, now);

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
    const taskTable = TASK_TABLE;

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
    const taskTable = TASK_TABLE;

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
    const taskTable = TASK_TABLE;

    const row = db.prepare(`
      SELECT id, session_id as sessionId, status, progress, created_at as createdAt, updated_at as updatedAt
      FROM ${taskTable}
      WHERE session_id = ? AND stage = ?
      ORDER BY created_at DESC
      LIMIT 1
    `).get(sessionId, stage) as TaskRecord | undefined;

    return row || null;
  }

  getSteps(taskId: string, stage: SessionStage): StepRecord[] {
    const db = getDb();
    const stepTable = STEP_TABLE;

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
