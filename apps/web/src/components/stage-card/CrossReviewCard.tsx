import type { SessionAggregate } from '@neobee/shared';
import { useTranslation } from 'react-i18next';
import TaskStepHistory from '../TaskStepHistory';
import '../../styles/stage-card/CrossReviewCard.css';
import '../../styles/TaskProgressIndicator.css';

interface TaskProgressData {
  status: string;
  progress: number;
  currentStep?: { name: string; data: Record<string, unknown> };
}

interface CrossReviewCardProps {
  session: SessionAggregate | null;
  taskProgress?: TaskProgressData;
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
            <TaskStepHistory sessionId={session.session.id} stage="cross_review" />
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
