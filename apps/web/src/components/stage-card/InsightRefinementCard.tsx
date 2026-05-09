import type { SessionAggregate } from '@neobee/shared';
import { useTranslation } from 'react-i18next';
import TaskStepHistory from '../TaskStepHistory';
import '../../styles/TaskProgressIndicator.css';

interface TaskProgressData {
  status: string;
  progress: number;
  currentStep?: { name: string; data: Record<string, unknown> };
}

interface InsightRefinementProps {
  session: SessionAggregate | null;
  taskProgress?: TaskProgressData;
}

export default function InsightRefinement({ session, taskProgress }: InsightRefinementProps) {
  const { t } = useTranslation();
  const isComplete = session?.session.currentStage !== 'insight_refinement';

  if (!session?.rounds.length) {
    return <div className="nb-empty">{t('noInsightsYet')}</div>;
  }

  return (
    <article className="nb-stage-card">
      {taskProgress && taskProgress.status === 'running' && (
        <div className="nb-task-progress-indicator">
          <div className="nb-task-progress-header">
            <span className="nb-task-progress-stage">Insight Refinement</span>
            <span className="nb-task-progress-pct">{taskProgress.progress}%</span>
          </div>
          <div className="nb-task-progress-bar">
            <div className="nb-task-progress-fill" style={{ width: `${taskProgress.progress}%` }} />
          </div>
          {session && (
            <TaskStepHistory sessionId={session.session.id} stage="insight_refinement" />
          )}
        </div>
      )}
      <div className="nb-card-header">
        <h3>{t('insightRounds') || 'Insight Rounds'}</h3>
        {isComplete && <span className="nb-stage-complete">{t('completed') || '✓'}</span>}
      </div>
      {session.rounds.map((round) => (
        <div key={`${round.expertId}-${round.round}`} className="nb-round-card">
          <div className="nb-round-header">
            <span className="nb-round-chip">{t('expert')} {round.expertId.slice(0, 8)} - {t('round')} {round.round}</span>
            <span className="nb-round-count">{round.insights.length} {t('insightsCount')}</span>
          </div>
          <div className="nb-round-feed">
            {round.insights.map((insight) => (
              <div key={insight.id} className="nb-round-item">
                <div className="nb-round-statement">{insight.insight}</div>
                <div className="nb-round-rationale">{insight.rationale}</div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </article>
  );
}
