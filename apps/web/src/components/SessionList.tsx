import type { SessionAggregate } from '@neobee/shared';
import { useTranslation } from 'react-i18next';
import '../styles/SessionList.css';

interface SessionListProps {
  sessions: SessionAggregate[];
  currentSession: SessionAggregate | null;
  onSelectSession: (session: SessionAggregate) => void;
  onNewSession: () => void;
}

function formatUpdatedAt(timestamp: string): string {
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  }).format(new Date(timestamp));
}

export default function SessionList({
  sessions,
  currentSession,
  onSelectSession,
  onNewSession
}: SessionListProps) {
  const { t } = useTranslation();

  return (
    <div className="nb-session-list">
      <div className="nb-session-list-header">
        <div>
          <h2>{t('sessions')}</h2>
          <p>{t('workspaceSessions')}</p>
        </div>
        <button className="nb-session-new-btn" onClick={onNewSession} title={t('newSession')}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
        </button>
      </div>
      <div className="nb-session-list-items">
        {sessions.length === 0 ? (
          <div className="nb-session-list-empty">
            {t('noSessions')}
          </div>
        ) : (
          sessions.map((session) => (
            <button
              key={session.session.id}
              className={`nb-session-item ${currentSession?.session.id === session.session.id ? 'active' : ''}`}
              onClick={() => onSelectSession(session)}
            >
              <span className="nb-session-item-topic">{session.session.topic}</span>
              <span className="nb-session-item-status">{session.session.status}</span>
              <span className="nb-session-item-meta">
                {formatUpdatedAt(session.session.updatedAt)} • {t(session.session.currentStage ?? 'topic_intake')}
              </span>
            </button>
          ))
        )}
      </div>
    </div>
  );
}
