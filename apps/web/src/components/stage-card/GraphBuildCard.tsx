import type { SessionAggregate } from '@neobee/shared';
import { useTranslation } from 'react-i18next';
import TaskStepHistory from '../TaskStepHistory';
import '../../styles/stage-card/GraphBuildCard.css';
import '../../styles/TaskProgressIndicator.css';

interface TaskProgressData {
  status: string;
  progress: number;
  currentStep?: { name: string; data: Record<string, unknown> };
}

interface GraphBuildCardProps {
  session: SessionAggregate | null;
  taskProgress?: TaskProgressData;
}

export default function GraphBuildCard({ session, taskProgress }: GraphBuildCardProps) {
  const { t } = useTranslation();
  const isComplete = session?.session.currentStage !== 'graph_build';

  return (
    <article className="nb-stage-card">
      {taskProgress && taskProgress.status === 'running' && (
        <div className="nb-task-progress-indicator">
          <div className="nb-task-progress-header">
            <span className="nb-task-progress-stage">Building Graph</span>
            <span className="nb-task-progress-pct">{taskProgress.progress}%</span>
          </div>
          <div className="nb-task-progress-bar">
            <div className="nb-task-progress-fill" style={{ width: `${taskProgress.progress}%` }} />
          </div>
          {session && (
            <TaskStepHistory sessionId={session.session.id} stage="graph_build" />
          )}
        </div>
      )}
      <div className="nb-card-header">
        <h3>{t('knowledgeGraph') || 'Knowledge Graph'}</h3>
        {isComplete && <span className="nb-stage-complete">{t('completed') || '✓'}</span>}
      </div>
      {session?.graph && session.graph.nodes.length > 0 ? (
        <div className="nb-graph-stats">
          <div className="nb-graph-stat">
            <span className="nb-graph-stat-value">{session.graph.nodes.length}</span>
            <span className="nb-graph-stat-label">{t('nodes') || 'Nodes'}</span>
          </div>
          <div className="nb-graph-stat">
            <span className="nb-graph-stat-value">{session.graph.edges.length}</span>
            <span className="nb-graph-stat-label">{t('edges') || 'Edges'}</span>
          </div>
        </div>
      ) : (
        <div className="nb-empty">{t('noData') || 'No graph data yet'}</div>
      )}
    </article>
  );
}
