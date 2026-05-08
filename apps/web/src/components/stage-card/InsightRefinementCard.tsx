import { useState, useEffect } from 'react';
import type { SessionAggregate } from '@neobee/shared';
import { useTranslation } from 'react-i18next';
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

interface InsightRefinementProps {
  session: SessionAggregate | null;
  taskProgress?: TaskProgressData;
}

function mapRelationClass(relationType: string) {
  if (relationType === 'contradict' || relationType === 'risk') return 'risk';
  if (relationType === 'support') return 'support';
  return 'neutral';
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
            {(step.data as { round?: number })?.round && (
              <span className="nb-task-step-msg">Round {(step.data as { round?: number }).round}</span>
            )}
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
            <StepsPaginatedList sessionId={session.session.id} stage="insight_refinement" />
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
                <div className="nb-round-statement">{insight.statement}</div>
                <div className="nb-round-rationale">{insight.rationale}</div>
                {insight.links[0] ? (
                  <div className={`nb-round-link ${mapRelationClass(insight.links[0].relationType)}`}>
                    {mapRelationClass(insight.links[0].relationType)} {'→'} {insight.links[0].targetInsightId.slice(0, 8)}
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      ))}
    </article>
  );
}
