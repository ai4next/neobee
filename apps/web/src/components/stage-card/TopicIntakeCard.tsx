import { FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import type { CreateSessionInput, SessionAggregate } from '@neobee/shared';
import '../../styles/stage-card/TopicIntakeCard.css';

interface TopicIntakeCardProps {
  session: SessionAggregate | null;
  form: CreateSessionInput;
  onFormChange: (form: CreateSessionInput) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  isSubmitting: boolean;
  error: string | null;
  onNewSession?: () => void;
}

export default function TopicIntakeCard({
  session,
  form,
  onFormChange,
  onSubmit,
  isSubmitting,
  error
}: TopicIntakeCardProps) {
  const { t } = useTranslation();

  return (
    <article className="nb-stage-card">
      {!session ? (
        <form className="nb-intake-form centered" onSubmit={onSubmit}>
          <label className="nb-field">
            <span>{t('topic') || 'Topic'}</span>
            <input
              type="text"
              value={form.topic}
              onChange={(e) => onFormChange({ ...form, topic: e.target.value })}
              placeholder={t('topicPlaceholder') || 'Enter your topic or question...'}
            />
          </label>
          <label className="nb-field">
            <span>{t('rounds')}</span>
            <input
              type="number"
              min={1}
              max={10000}
              value={form.roundCount}
              onChange={(e) => onFormChange({ ...form, roundCount: Math.max(1, Math.min(10000, Number(e.target.value))) })}
            />
          </label>
          <label className="nb-field">
            <span>{t('experts')}</span>
            <input
              type="number"
              min={1}
              max={10000}
              value={form.expertCount}
              onChange={(e) => onFormChange({ ...form, expertCount: Math.max(1, Math.min(10000, Number(e.target.value))) })}
            />
          </label>
          <label className="nb-field">
            <span>{t('additionalInfo') || 'Additional Info'}</span>
            <textarea
              value={form.additionalInfo || ''}
              onChange={(e) => onFormChange({ ...form, additionalInfo: e.target.value })}
              placeholder={t('additionalInfoPlaceholder') || 'Any additional context...'}
              rows={4}
            />
          </label>
          <div className="nb-form-actions">
            <button className="nb-primary-btn nb-send-btn" disabled={isSubmitting || !form.topic.trim()} type="submit">
              {isSubmitting ? (
                <span className="nb-loading">{t('running')}</span>
              ) : (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="22" y1="2" x2="11" y2="13"/>
                  <polygon points="22 2 15 22 11 13 2 9 22 2"/>
                </svg>
              )}
            </button>
          </div>
          {error ? <div className="nb-error wide">{error}</div> : null}
        </form>
      ) : (
        <div className="nb-session-active">
          <div className="nb-submitted-fields">
            <div className="nb-field-display">
              <label>{t('topic')}</label>
              <p>{form.topic}</p>
            </div>
            <div className="nb-field-display">
              <label>{t('rounds')}</label>
              <p>{form.roundCount}</p>
            </div>
            <div className="nb-field-display">
              <label>{t('experts')}</label>
              <p>{form.expertCount}</p>
            </div>
            {form.additionalInfo && (
              <div className="nb-field-display">
                <label>{t('additionalInfo')}</label>
                <p>{form.additionalInfo}</p>
              </div>
            )}
          </div>
        </div>
      )}
    </article>
  );
}
