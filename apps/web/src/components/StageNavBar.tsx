import type { SessionAggregate, SessionStage } from '@neobee/shared';
import { useTranslation } from 'react-i18next';
import { stageMeta } from './stageMeta';
import type { TaskProgressState } from '../hooks/useTaskProgress';
import '../styles/StageNavBar.css';

interface StageNavBarProps {
  session: SessionAggregate | null;
  selectedStage: SessionStage;
  onSelectStage: (stage: SessionStage) => void;
  taskProgress?: TaskProgressState;
}

function getStageMetric(session: SessionAggregate | null, stage: SessionStage): number | null {
  if (!session) {
    return null;
  }

  switch (stage) {
    case 'deep_research':
      return session.researchBrief?.signals.length ?? 0;
    case 'expert_creation':
      return session.experts.length;
    case 'insight_refinement':
      return session.rounds.length;
    case 'cross_review':
      return session.reviews.length;
    case 'idea_synthesis':
      return session.ideas.length;
    case 'graph_build':
      return session.graph.nodes.length;
    case 'summary':
      return session.summary?.bestIdeas.length ?? 0;
    default:
      return null;
  }
}

export default function StageNavBar({
  session,
  selectedStage,
  onSelectStage,
  taskProgress = {}
}: StageNavBarProps) {
  const { t } = useTranslation();
  const currentStage = session?.session.currentStage;

  return (
    <div className="nb-stage-nav-bar">
      <div className="nb-stage-nav-bar-track">
        {stageMeta.map((meta, index) => {
          const isActive = currentStage === meta.stage;
          const currentIndex = stageMeta.findIndex((item) => item.stage === currentStage);
          const isCompleted = currentIndex > index;
          const isSelected = selectedStage === meta.stage;
          const progress = taskProgress[meta.stage];
          const metric = getStageMetric(session, meta.stage);

          return (
            <button
              key={meta.stage}
              className={`nb-stage-nav-bar-item ${isSelected ? 'selected' : ''} ${isActive ? 'active' : ''} ${isCompleted ? 'completed' : ''}`}
              onClick={() => onSelectStage(meta.stage)}
            >
              <span className="nb-stage-nav-bar-code">{String(index + 1).padStart(2, '0')}</span>
              <span className="nb-stage-nav-bar-copy">
                <span className="nb-stage-nav-bar-name">{t(meta.stage)}</span>
                <span className="nb-stage-nav-bar-subline">
                  {progress?.status === 'running' ? `${progress.progress}%` : t(isCompleted ? 'completed' : 'pending')}
                  {metric !== null ? ` • ${metric}` : ''}
                </span>
              </span>
              {isActive && <span className="nb-stage-nav-bar-dot" />}
            </button>
          );
        })}
      </div>
    </div>
  );
}
