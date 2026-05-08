import { useState, useEffect } from 'react';
import type { SessionAggregate } from '@neobee/shared';
import { useTranslation } from 'react-i18next';
import '../../styles/stage-card/CrossReviewCard.css';
import '../../styles/TaskProgressIndicator.css';

interface TaskProgressData {
  status: string;
  progress: number;
  currentStep?: { name: string; data: Record<string, unknown> };
}

interface StepData {
  id: string;
  taskId: string;
  name: string;
  data: Record<string, unknown>;
  createdAt: string;
}

interface CrossReviewCardProps {
  session: SessionAggregate | null;
  taskProgress?: TaskProgressData;
}

function StepsPaginatedList({ sessionId, stage }: { sessionId: string; stage: string }) {
  const [steps, setSteps] = useState<StepData[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchSteps(page);
  }, [sessionId, stage, page]);

  async function fetchSteps(pageNum: number) {
    setLoading(true);
    try {
      const res = await fetch(`/api/sessions/${sessionId}/tasks/${stage}?page=${pageNum}&pageSize=10`);
      if (res.ok) {
        const data = await res.json();
        setSteps(data.steps || []);
        setTotalPages(data.totalPages || 1);
      }
    } catch (err) {
      console.error('Failed to fetch steps:', err);
    }
    setLoading(false);
  }

  if (steps.length === 0 && !loading) return null;

  return (
    <div className="nb-steps-pagination">
      <div className="nb-steps-list">
        {steps.map((step, idx) => (
          <div key={idx} className="nb-task-progress-step">
            <span className="nb-task-step-name">{step.name}</span>
          </div>
        ))}
      </div>
      {totalPages > 1 && (
        <div className="nb-pagination-controls">
          <button disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Prev</button>
          <span>{page} / {totalPages}</span>
          <button disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>Next</button>
        </div>
      )}
    </div>
  );
}

export default function CrossReviewCard({ session, taskProgress }: CrossReviewCardProps) {
  const { t } = useTranslation();
  const isComplete = session?.session.currentStage !== 'cross_review';

  return (
    <article className="nb-stage-card">
      {taskProgress && taskProgress.status === 'running' && (
        <div className="nb-task-progress-indicator">
          <div className="nb-task-progress-header">
            <span className="nb-task-progress-stage">Cross Review</span>
            <span className="nb-task-progress-pct">{taskProgress.progress}%</span>
          </div>
          <div className="nb-task-progress-bar">
            <div className="nb-task-progress-fill" style={{ width: `${taskProgress.progress}%` }} />
          </div>
          {session && (
            <StepsPaginatedList sessionId={session.session.id} stage="cross_review" />
          )}
        </div>
      )}
      <div className="nb-card-header">
        <h3>{t('reviews') || 'Cross Reviews'}</h3>
        {isComplete && <span className="nb-stage-complete">{t('completed') || '✓'}</span>}
      </div>
      {session?.reviews && session.reviews.length > 0 ? (
        <div className="nb-review-list">
          {session.reviews.map((review, idx) => (
            <div key={idx} className="nb-review-item">
              <div className="nb-review-header">
                <span className="nb-review-expert">{review.reviewerExpertId}</span>
                <span className={`nb-review-objection objection-${review.objectionLevel}`}>
                  {review.objectionLevel}
                </span>
              </div>
              <div className="nb-review-scores">
                <span>N: {review.novelty}</span>
                <span>U: {review.usefulness}</span>
                <span>F: {review.feasibility}</span>
                <span>E: {review.evidenceStrength}</span>
                <span>C: {review.crossDomainLeverage}</span>
                <span>R: {review.riskAwareness}</span>
              </div>
              <p className="nb-review-comment">{review.comment}</p>
            </div>
          ))}
        </div>
      ) : (
        <div className="nb-empty">{t('noData') || 'No reviews yet'}</div>
      )}
    </article>
  );
}
