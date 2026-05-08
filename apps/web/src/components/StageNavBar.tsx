import type { SessionAggregate, SessionStage } from '@neobee/shared';
import { useTranslation } from 'react-i18next';
import { stageMeta } from './stageMeta';
import '../styles/StageNavBar.css';

interface StageNavBarProps {
  session: SessionAggregate | null;
  selectedStage: SessionStage;
  onSelectStage: (stage: SessionStage) => void;
  taskProgress?: Record<string, {
    status: string;
    progress: number;
    currentStep?: { name: string; data: Record<string, unknown> };
  }>;
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
          const isCompleted = session && stageMeta.findIndex(m => m.stage === currentStage) > index;
          const isSelected = selectedStage === meta.stage;
          const progress = taskProgress[meta.stage];

          return (
            <div key={meta.stage} className="nb-stage-nav-item-wrapper">
              <button
                className={`nb-stage-nav-bar-item ${isSelected ? 'selected' : ''} ${isActive ? 'active' : ''} ${isCompleted ? 'completed' : ''}`}
                onClick={() => onSelectStage(meta.stage)}
              >
                <span className="nb-stage-nav-bar-code">{String(index + 1).padStart(2, '0')}</span>
                <span className="nb-stage-nav-bar-name">{t(meta.stage)}</span>
                {isActive && <span className="nb-stage-nav-bar-dot" />}
                {isActive && progress && progress.status === 'running' && (
                  <span className="nb-stage-nav-bar-progress">{progress.progress}%</span>
                )}
              </button>
              {index < stageMeta.length - 1 && (
                <div className={`nb-stage-nav-bar-arrow ${isCompleted ? 'passed' : ''}`}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polyline points="9 18 15 12 9 6" />
                  </svg>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
