import type { SessionAggregate } from '@neobee/shared';
import { useTranslation } from 'react-i18next';
import TaskStepHistory from '../TaskStepHistory';
import '../../styles/stage-card/ExpertsCard.css';
import '../../styles/TaskProgressIndicator.css';

interface TaskProgressData {
  status: string;
  progress: number;
  currentStep?: { name: string; data: Record<string, unknown> };
}

interface ExpertsCardProps {
  session: SessionAggregate | null;
  taskProgress?: TaskProgressData;
}

export default function ExpertsCard({ session, taskProgress }: ExpertsCardProps) {
  const { t } = useTranslation();
  const isComplete = session?.session.currentStage !== 'expert_creation';

  return (
    <article className="nb-stage-card">
      {taskProgress && taskProgress.status === 'running' && (
        <div className="nb-task-progress-indicator">
          <div className="nb-task-progress-header">
            <span className="nb-task-progress-stage">Creating Experts</span>
            <span className="nb-task-progress-pct">{taskProgress.progress}%</span>
          </div>
          <div className="nb-task-progress-bar">
            <div className="nb-task-progress-fill" style={{ width: `${taskProgress.progress}%` }} />
          </div>
          {session && (
            <TaskStepHistory sessionId={session.session.id} stage="expert_creation" />
          )}
        </div>
      )}
      <div className="nb-card-header">
        <h3>{t('experts')}</h3>
        {isComplete && <span className="nb-stage-complete">{t('completed') || '✓'}</span>}
      </div>
      {session?.experts.length ? (
        <div className="nb-expert-grid">
          {session.experts.map((expert) => (
            <div key={expert.id} className="nb-expert-card">
              <div className="nb-expert-domain">{expert.domain}</div>
              <div className="nb-expert-name">{expert.name}</div>
              <div className="nb-expert-stance">{expert.stance}</div>
              <div className="nb-expert-question">{expert.personaStyle}</div>
            </div>
          ))}
        </div>
      ) : (
        <div className="nb-empty">{t('noData')}</div>
      )}
    </article>
  );
}
