import type { ResearchProgress, SessionAggregate } from '@neobee/shared';
import { useTranslation } from 'react-i18next';
import TaskStepHistory from '../TaskStepHistory';
import '../../styles/stage-card/ResearchCard.css';
import '../../styles/TaskProgressIndicator.css';

interface TaskProgressData {
  status: string;
  progress: number;
  steps: { name: string; data: Record<string, unknown> }[];
}

interface ResearchCardProps {
  session: SessionAggregate | null;
  taskProgress?: TaskProgressData;
}

interface MetricListProps {
  title: string;
  items: string[];
}

function MetricList({ title, items }: MetricListProps) {
  const { t } = useTranslation();
  return (
    <div className="nb-metric-block">
      <div className="nb-metric-title">{title}</div>
      {items.length ? (
        <ul>
          {items.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      ) : (
        <div className="nb-empty">{t('noItems')}</div>
      )}
    </div>
  );
}

function ResearchProgressIndicator({ progress }: { progress: ResearchProgress }) {
  const stageLabels: Record<string, string> = {
    initializing: '🔄 Initializing',
    analyzing: '🔍 Analyzing',
    gathering_facts: '📚 Gathering Facts',
    identifying_questions: '❓ Identifying Questions',
    synthesizing: '✨ Synthesizing'
  };

  return (
    <div className="nb-progress-indicator">
      <span className="nb-progress-stage">{stageLabels[progress.stage] || progress.stage}</span>
      <span className="nb-progress-message">{progress.message}</span>
    </div>
  );
}

export default function ResearchCard({ session, taskProgress }: ResearchCardProps) {
  const { t } = useTranslation();

  // Show progress if research is still running
  const progressList = session?.researchProgress || [];
  const hasProgress = progressList.length > 0;
  const hasResult = !!session?.researchBrief;

  const isComplete = session?.session.currentStage !== 'deep_research';

  return (
    <article className="nb-stage-card">
      {taskProgress && taskProgress.status === 'running' && (
        <div className="nb-task-progress-indicator">
          <div className="nb-task-progress-header">
            <span className="nb-task-progress-stage">Deep Research</span>
            <span className="nb-task-progress-pct">{taskProgress.progress}%</span>
          </div>
          <div className="nb-task-progress-bar">
            <div className="nb-task-progress-fill" style={{ width: `${taskProgress.progress}%` }} />
          </div>
          {session && (
            <TaskStepHistory sessionId={session.session.id} stage="deep_research" />
          )}
        </div>
      )}
      {hasProgress && !hasResult && (
        <div className="nb-research-progress">
          <h4>{t('researchProgress') || 'Research Progress'}</h4>
          <div className="nb-progress-list">
            {progressList.map((p, i) => (
              <ResearchProgressIndicator key={i} progress={p} />
            ))}
            <div className="nb-progress-spinner">
              <span className="nb-spinner"></span>
              <span>Processing...</span>
            </div>
          </div>
        </div>
      )}

      {session?.researchBrief ? (
        <div className="nb-card-stack">
          <p className="nb-rich-copy">{session.researchBrief.topicFrame}</p>
          <MetricList title={t('signals')} items={session.researchBrief.signals} />
          <MetricList title={t('openQuestions')} items={session.researchBrief.openQuestions} />
          {isComplete && session.researchBrief.keyFacts.length > 0 && (
            <MetricList title={t('keyFacts') || 'Key Facts'} items={session.researchBrief.keyFacts} />
          )}
          {isComplete && session.researchBrief.sourceRefs.length > 0 && (
            <MetricList title={t('sources') || 'Sources'} items={session.researchBrief.sourceRefs} />
          )}
        </div>
      ) : !hasProgress && (
        <div className="nb-empty">{t('noData')}</div>
      )}
    </article>
  );
}

export { MetricList };
