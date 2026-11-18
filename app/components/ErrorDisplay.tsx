import { useState } from 'react';
import { WarningCircle, ArrowClockwise, X } from '@phosphor-icons/react';
import type { RecoveryAction } from '@/lib/errors';

export interface ErrorDisplayProps {
  message: string;
  code?: string;
  recovery?: RecoveryAction[];
  technical?: string;
  onDismiss?: () => void;
  onRecovery?: (action: RecoveryAction) => void;
}

export function ErrorDisplay({
  message,
  code,
  recovery = [],
  technical,
  onDismiss,
  onRecovery
}: ErrorDisplayProps) {
  const [showTechnical, setShowTechnical] = useState(false);

  return (
    <div className="error-display" role="alert" aria-live="assertive">
      <div className="error-header">
        <div className="error-icon">
          <WarningCircle size={24} weight="fill" />
        </div>
        <div className="error-content">
          <h3 className="error-title">Something went wrong</h3>
          <p className="error-message">{message}</p>
        </div>
        {onDismiss && (
          <button
            onClick={onDismiss}
            className="error-dismiss"
            aria-label="Dismiss error"
          >
            <X size={20} />
          </button>
        )}
      </div>

      {recovery.length > 0 && (
        <div className="error-recovery">
          <p className="recovery-label">What would you like to do?</p>
          <div className="recovery-actions">
            {recovery.map((action, index) => (
              <button
                key={index}
                onClick={() => onRecovery?.(action)}
                className="recovery-button"
              >
                {action.type === 'retry' && <ArrowClockwise size={16} />}
                <span className="recovery-label">{action.label}</span>
                {action.description && (
                  <span className="recovery-description">{action.description}</span>
                )}
              </button>
            ))}
          </div>
        </div>
      )}

      {technical && (
        <details className="error-technical">
          <summary onClick={() => setShowTechnical(!showTechnical)}>
            Technical details {code && `(${code})`}
          </summary>
          {showTechnical && (
            <pre className="technical-content">{technical}</pre>
          )}
        </details>
      )}

      <style jsx>{`
        .error-display {
          background: var(--error-bg);
          border: var(--stroke) solid var(--error-border);
          border-radius: 12px;
          padding: 1.5rem;
          margin: 1.5rem 0;
        }

        .error-header {
          display: flex;
          gap: 1rem;
          align-items: flex-start;
        }

        .error-icon {
          color: var(--error);
          flex-shrink: 0;
        }

        .error-content {
          flex: 1;
        }

        .error-title {
          font-size: 1.125rem;
          font-weight: 600;
          margin: 0 0 0.5rem 0;
          color: var(--ink);
        }

        .error-message {
          margin: 0;
          color: var(--muted);
          line-height: 1.5;
        }

        .error-dismiss {
          background: none;
          border: none;
          cursor: pointer;
          color: var(--muted);
          padding: 0.25rem;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 4px;
          transition: all 0.15s var(--ease);
        }

        .error-dismiss:hover {
          background: var(--surface-hover);
          color: var(--ink);
        }

        .error-recovery {
          margin-top: 1.5rem;
          padding-top: 1.5rem;
          border-top: 1px solid var(--error-border);
        }

        .recovery-label {
          font-size: 0.875rem;
          font-weight: 500;
          margin: 0 0 0.75rem 0;
          color: var(--muted);
        }

        .recovery-actions {
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
        }

        .recovery-button {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          padding: 0.75rem 1rem;
          background: var(--panel);
          border: 1px solid var(--line);
          border-radius: 8px;
          cursor: pointer;
          transition: all 0.15s var(--ease);
          text-align: left;
          width: 100%;
        }

        .recovery-button:hover {
          background: var(--surface-hover);
          border-color: var(--ink);
        }

        .recovery-button:active {
          transform: scale(0.98);
        }

        .recovery-button .recovery-label {
          font-weight: 500;
          color: var(--ink);
          margin: 0;
        }

        .recovery-button .recovery-description {
          display: block;
          font-size: 0.8125rem;
          color: var(--dim);
          margin-top: 0.25rem;
        }

        .error-technical {
          margin-top: 1rem;
          padding-top: 1rem;
          border-top: 1px solid var(--error-border);
        }

        .error-technical summary {
          cursor: pointer;
          font-size: 0.8125rem;
          color: var(--dim);
          user-select: none;
          padding: 0.5rem;
          margin: -0.5rem;
          border-radius: 4px;
          transition: background 0.15s var(--ease);
        }

        .error-technical summary:hover {
          background: var(--surface-hover);
        }

        .technical-content {
          margin: 0.75rem 0 0 0;
          padding: 0.75rem;
          background: var(--bg);
          border-radius: 6px;
          font-size: 0.75rem;
          color: var(--dim);
          overflow-x: auto;
          white-space: pre-wrap;
          word-break: break-word;
        }

        @media (min-width: 640px) {
          .recovery-actions {
            flex-direction: row;
            flex-wrap: wrap;
          }

          .recovery-button {
            width: auto;
            flex: 1;
            min-width: 200px;
          }
        }
      `}</style>
    </div>
  );
}
