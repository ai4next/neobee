import type { SessionAggregate } from '@neobee/shared';
import { useTranslation } from 'react-i18next';
import TaskStepHistory from '../TaskStepHistory';
import { MetricList } from './ResearchCard';
import '../../styles/stage-card/SummaryCard.css';
import '../../styles/TaskProgressIndicator.css';

interface TaskProgressData {
  status: string;
  progress: number;
  currentStep?: { name: string; data: Record<string, unknown> };
}

interface SummaryCardProps {
  session: SessionAggregate | null;
  taskProgress?: TaskProgressData;
}

export default function SummaryCard({ session, taskProgress }: SummaryCardProps) {
  const { t } = useTranslation();
  const isComplete = session?.session.currentStage !== 'summary';

  return (
    <article className="nb-stage-card">
      {taskProgress && taskProgress.status === 'running' && (
        <div className="nb-task-progress-indicator">
          <div className="nb-task-progress-header">
            <span className="nb-task-progress-stage">Generating Summary</span>
            <span className="nb-task-progress-pct">{taskProgress.progress}%</span>
          </div>
          <div className="nb-task-progress-bar">
            <div className="nb-task-progress-fill" style={{ width: `${taskProgress.progress}%` }} />
          </div>
          {session && (
            <TaskStepHistory sessionId={session.session.id} stage="summary" />
          )}
        </div>
      )}
      <div className="nb-card-header">
        <h3>{t('summary')}</h3>
        {isComplete && <span className="nb-stage-complete">{t('completed') || '✓'}</span>}
      </div>
      {session?.summary ? (
        <div className="nb-card-stack">
          <p className="nb-rich-copy">{session.summary.executiveSummary}</p>
          <MetricList title={t('bestIdeas')} items={session.summary.bestIdeas} />
          <MetricList title={t('controversialIdeas')} items={session.summary.controversialIdeas} />
          <MetricList title={t('unresolvedQuestions')} items={session.summary.unresolvedQuestions} />
        </div>
      ) : (
        <div className="nb-empty">{t('noSummaryYet')}</div>
      )}
    </article>
  );
}
