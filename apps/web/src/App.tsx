import { useState, useEffect, useRef, FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import type { CreateSessionInput, ResearchProgress, SessionAggregate, SessionStage } from '@neobee/shared';
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

const WS_URL = import.meta.env.VITE_WS_URL ?? 'ws://localhost:4001';

const initialForm: CreateSessionInput = {
  topic: 'AI-native workflow ideas for solo founders',
  roundCount: 3,
  expertCount: 3,
  additionalInfo: '',
  language: 'en'
};

export default function App() {
  const { t, i18n } = useTranslation();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [systemModalOpen, setSystemModalOpen] = useState(false);
  const [darkMode, setDarkMode] = useState(false);
  const [form, setForm] = useState(initialForm);
  const [sessions, setSessions] = useState<SessionAggregate[]>([]);
  const [session, setSession] = useState<SessionAggregate | null>(null);
  const [selectedStage, setSelectedStage] = useState<SessionStage>('topic_intake');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [taskProgress, setTaskProgress] = useState<Record<string, {
    status: string;
    progress: number;
    steps: { name: string; data: Record<string, unknown> }[];
  }>>({});
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectAttempts = useRef(0);
  const maxReconnectAttempts = 5;

  useEffect(() => {
    fetchSessions();
  }, []);

  async function fetchSessions() {
    try {
      const res = await fetch('/api/sessions');
      if (res.ok) {
        const data = await res.json();
        setSessions(data);
      }
    } catch (err) {
      console.error('Failed to fetch sessions:', err);
    }
  }

  const toggleLanguage = () => {
    i18n.changeLanguage(i18n.language === 'en' ? 'zh' : 'en');
  };

  const subscribeToSession = (sessionId: string) => {
    const sendSubscribe = () => {
      const ws = wsRef.current;
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'subscribe_session', payload: { sessionId } }));
        return true;
      }
      return false;
    };

    if (sendSubscribe()) return;

    reconnectAttempts.current = 0;
    connectWebSocket();

    const checkAndSubscribe = setInterval(() => {
      if (sendSubscribe()) {
        clearInterval(checkAndSubscribe);
      }
    }, 50);

    setTimeout(() => clearInterval(checkAndSubscribe), 5000);
  };

  const connectWebSocket = () => {
    const current = wsRef.current;
    if (current && (current.readyState === WebSocket.OPEN || current.readyState === WebSocket.CONNECTING)) {
      return;
    }

    const ws = new WebSocket(WS_URL);
    wsRef.current = ws;

    ws.onmessage = (message) => {
      try {
        const data = JSON.parse(message.data);
        switch (data.type) {
          case 'session_state': {
            const aggregate = data.payload as SessionAggregate;
            setSession(aggregate);
            setSelectedStage(aggregate.session.currentStage || 'topic_intake');
            setSessions((prev) => {
              const exists = prev.some((s) => s.session.id === aggregate.session.id);
              if (exists) {
                return prev.map((s) => (s.session.id === aggregate.session.id ? aggregate : s));
              }
              return [aggregate, ...prev];
            });
            break;
          }
          case 'session_completed': {
            const aggregate = data.payload as SessionAggregate;
            setSession(aggregate);
            setSessions((prev) => prev.map((s) => (s.session.id === aggregate.session.id ? aggregate : s)));
            setIsSubmitting(false);
            break;
          }
          case 'event': {
            const event = data.payload as { stage: string; type: string; progress?: ResearchProgress };
            setSession((prev) => {
              if (!prev) return prev;
              const updated = {
                ...prev,
                session: {
                  ...prev.session,
                  currentStage: event.stage as any
                }
              };
              if (event.type === 'research.progress' && event.progress) {
                updated.researchProgress = [...(prev.researchProgress || []), event.progress];
              }
              return updated;
            });
            // Auto-switch to the stage from the event
            if (event.stage) {
              setSelectedStage(event.stage as SessionStage);
            }
            break;
          }
          case 'task.progress': {
            const progress = data.payload as {
              stage: string;
              taskId: string;
              status: string;
              progress: number;
              currentStep?: { name: string; data: Record<string, unknown> };
            };
            setTaskProgress((prev) => {
              const existing = prev[progress.stage];
              const newStep = progress.currentStep ? { name: progress.currentStep.name, data: progress.currentStep.data } : null;
              return {
                ...prev,
                [progress.stage]: {
                  status: progress.status,
                  progress: progress.progress,
                  steps: newStep && !existing?.steps.some(s => s.name === newStep.name)
                    ? [...(existing?.steps || []), newStep]
                    : (existing?.steps || [])
                }
              };
            });
            break;
          }
          case 'error': {
            setError(data.payload.message);
            setIsSubmitting(false);
            break;
          }
        }
      } catch {
        console.warn('Failed to parse WebSocket message');
      }
    };

    ws.onerror = () => {
      setError('WebSocket connection error');
    };

    ws.onclose = () => {
      wsRef.current = null;
      // Reconnection logic with exponential backoff
      if (reconnectAttempts.current < maxReconnectAttempts) {
        const delay = Math.min(1000 * Math.pow(2, reconnectAttempts.current), 30000);
        reconnectAttempts.current++;
        setTimeout(() => {
          connectWebSocket();
        }, delay);
      }
    };
  };

  useEffect(() => {
    return () => {
      wsRef.current?.close();
    };
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setError(null);

    try {
      const res = await fetch('/api/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, language: i18n.language })
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to create session');
      }

      const aggregate = await res.json() as SessionAggregate;
      setSession(aggregate);
      setSessions((prev) => [aggregate, ...prev]);

      // Subscribe for live updates in parallel; workflow start stays on HTTP.
      void subscribeToSession(aggregate.session.id);

      const runRes = await fetch(`/api/sessions/${aggregate.session.id}/run`, {
        method: 'POST'
      });
      if (!runRes.ok) {
        const err = await runRes.json();
        throw new Error(err.error || 'Failed to start session');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
      setIsSubmitting(false);
    }
  }

  function handleNewSession() {
    setSession(null);
    setError(null);
    setForm(initialForm);
    setSelectedStage('topic_intake');
  }

  function handleSelectSession(selectedSession: SessionAggregate) {
    setSession(selectedSession);
    setSelectedStage(selectedSession.session.currentStage || 'topic_intake');
    setForm({
      topic: selectedSession.session.topic,
      roundCount: selectedSession.session.roundCount,
      expertCount: selectedSession.session.expertCount,
      additionalInfo: selectedSession.session.additionalInfo || '',
      language: selectedSession.session.language || 'en'
    });

    void subscribeToSession(selectedSession.session.id);
  }

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
