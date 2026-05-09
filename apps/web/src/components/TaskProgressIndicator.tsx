interface TaskProgressData {
  status: string;
  progress: number;
  steps: { name: string; data: Record<string, unknown> }[];
}

interface TaskProgressIndicatorProps {
  taskProgress: TaskProgressData | undefined;
  stage: string;
}

const STAGE_LABELS: Record<string, string> = {
  topic_intake: 'Topic Intake',
  deep_research: 'Deep Research',
  expert_creation: 'Creating Experts',
  insight_refinement: 'Insight Refinement',
  cross_review: 'Cross Review',
  idea_synthesis: 'Idea Synthesis'
};

export default function TaskProgressIndicator({ taskProgress, stage }: TaskProgressIndicatorProps) {
  if (!taskProgress || taskProgress.status === 'completed') {
    return null;
  }

  const stageLabel = STAGE_LABELS[stage] || stage;

  return (
    <div className="nb-task-progress-indicator">
      <div className="nb-task-progress-header">
        <span className="nb-task-progress-stage">{stageLabel}</span>
        <span className="nb-task-progress-pct">{taskProgress.progress}%</span>
      </div>
      <div className="nb-task-progress-bar">
        <div
          className="nb-task-progress-fill"
          style={{ width: `${taskProgress.progress}%` }}
        />
      </div>
      {taskProgress.steps.length > 0 && (
        <div className="nb-task-progress-steps">
          {taskProgress.steps.map((step, idx) => (
            <div key={idx} className="nb-task-progress-step">
              <span className="nb-task-step-name">{step.name}</span>
              {(step.data as { message?: string })?.message && (
                <span className="nb-task-step-msg">{(step.data as { message?: string }).message}</span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}