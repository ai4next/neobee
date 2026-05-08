import { useEffect, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import type { CreateSessionInput, SessionAggregate, SessionEvent } from '@neobee/shared';
import './styles/App.css';
import './styles/Forms.css';
import SessionList from './components/SessionList';
import StageNavBar from './components/StageNavBar';
import TopicIntakeCard from './components/stage-card/TopicIntakeCard';
import ResearchCard from './components/stage-card/ResearchCard';
import ExpertsCard from './components/stage-card/ExpertsCard';
import InsightRefinementCard from './components/stage-card/InsightRefinementCard';
import CrossReviewCard from './components/stage-card/CrossReviewCard';
import IdeasCard from './components/stage-card/IdeasCard';
import GraphBuildCard from './components/stage-card/GraphBuildCard';
import SummaryCard from './components/stage-card/SummaryCard';
import { ConfigSettings } from './components/ConfigSettings';
import { useSessions } from './hooks/useSessions';

const initialForm: CreateSessionInput = {
  topic: 'AI-native workflow ideas for solo founders',
  roundCount: 3,
  expertCount: 3,
  additionalInfo: '',
  language: 'en'
};

function formatEventLabel(event: SessionEvent): string {
  return event.type.replace(/\./g, ' ');
}

function formatTimestamp(timestamp: string): string {
  return new Intl.DateTimeFormat(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    month: 'short',
    day: 'numeric'
  }).format(new Date(timestamp));
}

export default function App() {
  const { t, i18n } = useTranslation();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [systemModalOpen, setSystemModalOpen] = useState(false);
  const [darkMode, setDarkMode] = useState(false);
  const [form, setForm] = useState(initialForm);
  const {
    sessions,
    session,
    events,
    taskProgress,
    selectedStage,
    setSelectedStage,
    isSubmitting,
    error,
    createAndRunSession,
    selectSession,
    prepareNewSession
  } = useSessions(i18n.language);

  useEffect(() => {
    if (!session) {
      setForm(initialForm);
      return;
    }

    setForm({
      topic: session.session.topic,
      roundCount: session.session.roundCount,
      expertCount: session.session.expertCount,
      additionalInfo: session.session.additionalInfo || '',
      language: session.session.language || 'en'
    });
  }, [session]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await createAndRunSession({ ...form, language: i18n.language });
  }

  function handleNewSession() {
    prepareNewSession();
    setForm(initialForm);
  }

  function handleSelectSession(nextSession: SessionAggregate) {
    selectSession(nextSession);
  }

  const toggleLanguage = () => {
    i18n.changeLanguage(i18n.language === 'en' ? 'zh' : 'en');
  };

  const activeEventFeed = [...events].slice(-8).reverse();
  const stageStats = session
    ? [
        { label: t('signals'), value: session.researchBrief?.signals.length ?? 0 },
        { label: t('experts'), value: session.experts.length },
        { label: t('ideas'), value: session.ideas.length },
        { label: t('events'), value: events.length }
      ]
    : [];

  return (
    <main className={`neobee-shell${darkMode ? ' dark' : ''}`}>
      <section className="nb-main-grid">
        <div className="nb-panel left">
          <SessionList
            sessions={sessions}
            currentSession={session}
            onSelectSession={handleSelectSession}
            onNewSession={handleNewSession}
          />
        </div>

        <div className="nb-panel right">
          <StageNavBar
            session={session}
            selectedStage={selectedStage}
            onSelectStage={setSelectedStage}
            taskProgress={taskProgress}
          />

          {session && (
            <section className="nb-session-overview">
              <div className="nb-overview-hero">
                <span className="nb-overview-label">{t('currentPhase')}</span>
                <h2>{session.session.topic}</h2>
                <p>
                  {t(session.session.currentStage ?? 'topic_intake')} • {session.session.status}
                </p>
              </div>
              <div className="nb-overview-stats">
                {stageStats.map((item) => (
                  <div key={item.label} className="nb-overview-stat">
                    <span>{item.label}</span>
                    <strong>{item.value}</strong>
                  </div>
                ))}
              </div>
            </section>
          )}

          <div className="nb-workbench-grid">
            <div className="nb-workbench">
              {selectedStage === 'topic_intake' && (
                <TopicIntakeCard
                  session={session}
                  form={form}
                  onFormChange={setForm}
                  onSubmit={handleSubmit}
                  isSubmitting={isSubmitting}
                  error={error}
                  onNewSession={handleNewSession}
                />
              )}

              {selectedStage === 'deep_research' && <ResearchCard session={session} taskProgress={taskProgress.deep_research} />}
              {selectedStage === 'expert_creation' && <ExpertsCard session={session} taskProgress={taskProgress.expert_creation} />}
              {selectedStage === 'insight_refinement' && <InsightRefinementCard session={session} taskProgress={taskProgress.insight_refinement} />}
              {selectedStage === 'cross_review' && <CrossReviewCard session={session} taskProgress={taskProgress.cross_review} />}
              {selectedStage === 'idea_synthesis' && <IdeasCard session={session} taskProgress={taskProgress.idea_synthesis} />}
              {selectedStage === 'graph_build' && <GraphBuildCard session={session} taskProgress={taskProgress.graph_build} />}
              {selectedStage === 'summary' && <SummaryCard session={session} taskProgress={taskProgress.summary} />}
            </div>

            <aside className="nb-activity-rail">
              <article className="nb-stage-card mini">
                <div className="nb-card-header compact">
                  <div>
                    <div className="nb-card-code">{t('runtimeLog')}</div>
                    <h2>{t('events')}</h2>
                  </div>
                  <span className="nb-card-side">{events.length}</span>
                </div>
                {activeEventFeed.length > 0 ? (
                  <div className="nb-event-feed">
                    {activeEventFeed.map((eventItem) => (
                      <div key={eventItem.id} className="nb-event-row">
                        <div className="nb-event-meta">
                          <span>{t(eventItem.stage)}</span>
                          <span>{formatTimestamp(eventItem.timestamp)}</span>
                        </div>
                        <strong>{formatEventLabel(eventItem)}</strong>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="nb-empty">{t('noEvents')}</div>
                )}
              </article>

              <article className="nb-stage-card mini">
                <div className="nb-card-header compact">
                  <div>
                    <div className="nb-card-code">{t('selectedStage')}</div>
                    <h2>{t(selectedStage)}</h2>
                  </div>
                </div>
                <div className="nb-stage-guidance">
                  <p>{t('stageGuideIntro')}</p>
                  <div className="nb-stage-guidance-metrics">
                    <span>{t('statusLabel')}: {taskProgress[selectedStage]?.status ?? session?.session.status ?? t('pending')}</span>
                    <span>{t('progress')}: {taskProgress[selectedStage]?.progress ?? 0}%</span>
                  </div>
                </div>
                {error && <div className="nb-error wide">{error}</div>}
              </article>
            </aside>
          </div>
        </div>
      </section>

      <button
        className="nb-settings-btn"
        onClick={() => setSettingsOpen((prev) => !prev)}
        aria-label="Settings"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
        </svg>
      </button>

      {settingsOpen && (
        <div className="nb-settings-panel">
          <div className="nb-settings-header">
            <h3>{t('settings')}</h3>
            <button className="nb-settings-close" onClick={() => setSettingsOpen(false)}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
          <div className="nb-settings-body">
            <div className="nb-settings-menu">
              <button className="nb-settings-menu-item" onClick={toggleLanguage}>
                <span className="nb-menu-icon">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="12" r="10" />
                    <line x1="2" y1="12" x2="22" y2="12" />
                    <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
                  </svg>
                </span>
                <span className="nb-menu-label">{t('language')}</span>
                <span className="nb-menu-value">{i18n.language === 'en' ? 'EN' : '中文'}</span>
              </button>
              <button className="nb-settings-menu-item" onClick={() => setDarkMode(!darkMode)}>
                <span className="nb-menu-icon">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
                  </svg>
                </span>
                <span className="nb-menu-label">{t('theme')}</span>
                <span className="nb-menu-value">{darkMode ? 'Dark' : 'Light'}</span>
              </button>
              <button className="nb-settings-menu-item" onClick={() => { setSettingsOpen(false); setSystemModalOpen(true); }}>
                <span className="nb-menu-icon">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="12" r="3" />
                    <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
                  </svg>
                </span>
                <span className="nb-menu-label">{t('system')}</span>
                <span className="nb-menu-arrow">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polyline points="9 18 15 12 9 6" />
                  </svg>
                </span>
              </button>
            </div>
          </div>
        </div>
      )}

      {systemModalOpen && (
        <div className="nb-modal-overlay" onClick={() => setSystemModalOpen(false)}>
          <div className="nb-modal" onClick={(e) => e.stopPropagation()}>
            <div className="nb-modal-header">
              <button className="nb-modal-close" onClick={() => setSystemModalOpen(false)}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
            <div className="nb-modal-body">
              <ConfigSettings />
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
