import { useEffect, useState } from 'react';
import type { SessionStage } from '@neobee/shared';
import { api } from '../lib/api';

interface TaskStepHistoryProps {
  sessionId: string;
  stage: SessionStage;
}

interface StepRecord {
  id: string;
  taskId: string;
  name: string;
  data: Record<string, unknown>;
  createdAt: string;
}

export default function TaskStepHistory({ sessionId, stage }: TaskStepHistoryProps) {
  const [steps, setSteps] = useState<StepRecord[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setPage(1);
  }, [sessionId, stage]);

  useEffect(() => {
    setLoading(true);
    api.fetchTaskSteps(sessionId, stage, page)
      .then((data) => {
        setSteps(data.steps);
        setTotalPages(data.totalPages || 1);
      })
      .catch(() => {
        setSteps([]);
        setTotalPages(1);
      })
      .finally(() => {
        setLoading(false);
      });
  }, [page, sessionId, stage]);

  if (steps.length === 0 && !loading) {
    return null;
  }

  return (
    <div className="nb-steps-pagination">
      <div className="nb-steps-list">
        {steps.map((step) => (
          <div key={step.id} className="nb-task-progress-step">
            <span className="nb-task-step-name">{step.name}</span>
            {typeof step.data.message === 'string' && (
              <span className="nb-task-step-msg">{step.data.message}</span>
            )}
          </div>
        ))}
      </div>
      {totalPages > 1 && (
        <div className="nb-pagination-controls">
          <button disabled={page <= 1} onClick={() => setPage((current) => current - 1)}>Prev</button>
          <span>{page} / {totalPages}</span>
          <button disabled={page >= totalPages} onClick={() => setPage((current) => current + 1)}>Next</button>
        </div>
      )}
    </div>
  );
}
