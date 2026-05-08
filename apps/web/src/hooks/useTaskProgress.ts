import { useState } from 'react';
import type { SessionStage, TaskProgressPayload } from '@neobee/shared';

export type StageTaskProgress = {
  status: TaskProgressPayload['status'];
  progress: number;
  updatedAt: string;
  error?: string;
  currentStep?: { name: string; data: Record<string, unknown> };
  steps: Array<{ name: string; data: Record<string, unknown> }>;
};

export type TaskProgressState = Partial<Record<SessionStage, StageTaskProgress>>;

export function useTaskProgress() {
  const [taskProgress, setTaskProgress] = useState<TaskProgressState>({});

  function resetTaskProgress(): void {
    setTaskProgress({});
  }

  function applyTaskProgress(progress: TaskProgressPayload): void {
    setTaskProgress((previous) => {
      const existing = previous[progress.stage];
      const nextSteps =
        progress.currentStep &&
        !existing?.steps.some((step) => step.name === progress.currentStep?.name)
          ? [...(existing?.steps ?? []), progress.currentStep]
          : (existing?.steps ?? []);

      return {
        ...previous,
        [progress.stage]: {
          status: progress.status,
          progress: progress.progress,
          updatedAt: progress.updatedAt,
          error: progress.error,
          currentStep: progress.currentStep,
          steps: nextSteps
        }
      };
    });
  }

  return {
    taskProgress,
    resetTaskProgress,
    applyTaskProgress
  };
}
