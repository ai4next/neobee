import { getDb } from './db.js';
import type { SessionStage, SessionEventType } from '@neobee/shared';

export interface TaskRecord {
  id: string;
  sessionId: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
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

export type TaskProgressCallback = (event: {
  sessionId: string;
  stage: SessionStage;
  taskId: string;
  status: 'running' | 'completed' | 'failed';
  progress: number;
  currentStep?: { name: string; data: Record<string, unknown> };
}) => void;

type TaskTableName = 'topic_intake_task' | 'deep_research_task' | 'expert_creation_task' | 'insight_refinement_task' | 'cross_review_task' | 'idea_synthesis_task' | 'graph_build_task' | 'summary_task';
type StepTableName = 'topic_intake_step' | 'deep_research_step' | 'expert_creation_step' | 'insight_refinement_step' | 'cross_review_step' | 'idea_synthesis_step' | 'graph_build_step' | 'summary_step';

const TASK_TABLE_MAP: Record<SessionStage, TaskTableName> = {
  topic_intake: 'topic_intake_task',
  deep_research: 'deep_research_task',
  expert_creation: 'expert_creation_task',
  insight_refinement: 'insight_refinement_task',
  cross_review: 'cross_review_task',
  idea_synthesis: 'idea_synthesis_task',
  graph_build: 'graph_build_task',
  summary: 'summary_task'
};

const STEP_TABLE_MAP: Record<SessionStage, StepTableName> = {
  topic_intake: 'topic_intake_step',
  deep_research: 'deep_research_step',
  expert_creation: 'expert_creation_step',
  insight_refinement: 'insight_refinement_step',
  cross_review: 'cross_review_step',
  idea_synthesis: 'idea_synthesis_step',
  graph_build: 'graph_build_step',
  summary: 'summary_step'
};

export class TaskTracker {
  private currentTaskId: string | null = null;
  private currentTaskSessionId: string | null = null;
  private currentTaskStage: SessionStage | null = null;
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

    this.currentTaskId = taskId;
    this.currentTaskSessionId = sessionId;
    this.currentTaskStage = stage;

    this.onTaskProgress?.({
      sessionId,
      stage,
      taskId,
      status: 'running',
      progress: 0
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

  createStep(taskId: string | null, stage: SessionStage, name: string, data: Record<string, unknown> = {}): StepRecord | null {
    const db = getDb();
    const effectiveTaskId = taskId || this.currentTaskId;
    if (!effectiveTaskId) {
      return null;
    }

    const stepId = crypto.randomUUID();
    const now = new Date().toISOString();
    const stepTable = STEP_TABLE_MAP[stage];

    db.prepare(`
      INSERT INTO ${stepTable} (id, task_id, name, data, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(stepId, effectiveTaskId, name, JSON.stringify(data), now, now);

    this.onTaskProgress?.({
      sessionId: this.currentTaskSessionId ?? '',
      stage: stage,
      taskId: effectiveTaskId,
      status: 'running',
      progress: this.currentTaskStage === stage ? this.getProgressFromStepName(name) : 0,
      currentStep: { name, data }
    });

    return {
      id: stepId,
      taskId: effectiveTaskId,
      name,
      data: JSON.stringify(data),
      createdAt: now,
      updatedAt: now
    };
  }

  updateTaskProgress(stage: SessionStage, progress: number): void {
    if (!this.currentTaskId || this.currentTaskStage !== stage) {
      return;
    }

    const db = getDb();
    const now = new Date().toISOString();
    const taskTable = TASK_TABLE_MAP[stage];

    db.prepare(`
      UPDATE ${taskTable} SET progress = ?, updated_at = ? WHERE id = ?
    `).run(progress, now, this.currentTaskId);

    this.onTaskProgress?.({
      sessionId: this.currentTaskSessionId ?? '',
      stage,
      taskId: this.currentTaskId,
      status: 'running',
      progress
    });
  }

  completeTask(stage: SessionStage, status: 'completed' | 'failed' = 'completed'): void {
    if (!this.currentTaskId || this.currentTaskStage !== stage) {
      return;
    }

    const db = getDb();
    const now = new Date().toISOString();
    const taskTable = TASK_TABLE_MAP[stage];

    db.prepare(`
      UPDATE ${taskTable} SET status = ?, progress = 100, updated_at = ? WHERE id = ?
    `).run(status, now, this.currentTaskId);

    this.onTaskProgress?.({
      sessionId: this.currentTaskSessionId ?? '',
      stage,
      taskId: this.currentTaskId,
      status,
      progress: 100
    });

    this.currentTaskId = null;
    this.currentTaskSessionId = null;
    this.currentTaskStage = null;
  }

  private getProgressFromStepName(name: string): number {
    if (name === 'completed') return 100;
    if (name.startsWith('round_') && name.includes('completed')) return 90;
    if (name.startsWith('round_') && name.includes('started')) return 20;
    return 50;
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

    const rows = db.prepare(`
      SELECT id, task_id as taskId, name, data, created_at as createdAt, updated_at as updatedAt
      FROM ${stepTable}
      WHERE task_id = ?
      ORDER BY created_at ASC
    `).all(taskId) as StepRecord[];

    return rows;
  }
}

export const taskTracker = new TaskTracker();
