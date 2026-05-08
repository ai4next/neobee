import type { SessionAggregate } from '@neobee/shared';
import { useTranslation } from 'react-i18next';
import TaskStepHistory from '../TaskStepHistory';
import '../../styles/stage-card/IdeasCard.css';
import '../../styles/TaskProgressIndicator.css';

interface TaskProgressData {
  status: string;
  progress: number;
  currentStep?: { name: string; data: Record<string, unknown> };
}

interface IdeasCardProps {
  session: SessionAggregate | null;
  taskProgress?: TaskProgressData;
}

export default function IdeasCard({ session, taskProgress }: IdeasCardProps) {
  const { t } = useTranslation();
  const isComplete = session?.session.currentStage !== 'idea_synthesis';

  return (
    <article className="nb-stage-card">
      {taskProgress && taskProgress.status === 'running' && (
        <div className="nb-task-progress-indicator">
          <div className="nb-task-progress-header">
            <span className="nb-task-progress-stage">Idea Synthesis</span>
            <span className="nb-task-progress-pct">{taskProgress.progress}%</span>
          </div>
          <div className="nb-task-progress-bar">
            <div className="nb-task-progress-fill" style={{ width: `${taskProgress.progress}%` }} />
          </div>
          {session && (
            <TaskStepHistory sessionId={session.session.id} stage="idea_synthesis" />
          )}
        </div>
      )}
      <div className="nb-card-header">
        <h3>{t('ideas') || 'Ideas'}</h3>
        {isComplete && <span className="nb-stage-complete">{t('completed') || '✓'}</span>}
      </div>
      {session?.ideas.length ? (
        <div className="nb-card-stack">
          {session.ideas.map((idea) => (
            <div key={idea.id} className="nb-idea-card">
              <div className="nb-idea-title-row">
                <h3>{idea.title}</h3>
                <span className="nb-score-pill">{idea.totalScore}</span>
              </div>
              <p className="nb-rich-copy">{idea.thesis}</p>
              <div className="nb-idea-meta">{t('mechanism')}: {idea.coreMechanism}</div>
              <div className="nb-idea-meta">{t('target')}: {idea.targetUser}</div>
            </div>
          ))}
        </div>
      ) : (
        <div className="nb-empty">{t('noIdeasYet')}</div>
      )}
    </article>
  );
}
