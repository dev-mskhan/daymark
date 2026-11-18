/**
 * Task 8.26: Activity log timeline UI with user-friendly messages
 * Task 8.27: "Show technical details" toggle
 * Task 8.28: Persist technical view preference
 */

import { useState, useEffect } from 'react';
import type { RunEvent } from '@/lib/domain';
import { transformEvent, type UserFriendlyEvent } from '@/lib/event-messages';
import { getTechnicalViewPreference, setTechnicalViewPreference } from '@/lib/preferences';
import { CaretDown, CaretUp } from '@phosphor-icons/react';

interface ActivityLogProps {
  events: RunEvent[];
  className?: string;
}

export function ActivityLog({ events, className = '' }: ActivityLogProps) {
  const [showTechnical, setShowTechnical] = useState(false);
  const [expandedIndices, setExpandedIndices] = useState<Set<number>>(new Set());

  // Load preference on mount (Task 8.28)
  useEffect(() => {
    setShowTechnical(getTechnicalViewPreference());
  }, []);

  // Persist preference when changed (Task 8.28)
  const toggleTechnical = () => {
    const next = !showTechnical;
    setShowTechnical(next);
    setTechnicalViewPreference(next);
  };

  const toggleExpanded = (index: number) => {
    const next = new Set(expandedIndices);
    if (next.has(index)) {
      next.delete(index);
    } else {
      next.add(index);
    }
    setExpandedIndices(next);
  };

  if (events.length === 0) {
    return null;
  }

  return (
    <div className={`activity-log ${className}`}>
      <div className="activity-log-header">
        <h3>Activity Log</h3>
        <button
          type="button"
          className="toggle-technical"
          onClick={toggleTechnical}
          aria-pressed={showTechnical}
        >
          {showTechnical ? 'Hide' : 'Show'} technical details
        </button>
      </div>

      <div className="activity-log-timeline" role="list">
        {events.map((event, index) => {
          const friendly = transformEvent(event);
          const isExpanded = expandedIndices.has(index);
          const hasTechnical = friendly.technical && friendly.technical !== friendly.description;

          return (
            <div 
              key={index} 
              className={`log-entry log-entry--${friendly.type}`}
              role="listitem"
            >
              <div className="log-entry-marker">
                <span className="log-entry-icon" aria-hidden="true">
                  {friendly.icon}
                </span>
              </div>
              
              <div className="log-entry-content">
                <div className="log-entry-main">
                  <div className="log-entry-title">{friendly.title}</div>
                  <div className="log-entry-description">{friendly.description}</div>
                  
                  {hasTechnical && (
                    <button
                      type="button"
                      className="log-entry-toggle"
                      onClick={() => toggleExpanded(index)}
                      aria-expanded={isExpanded}
                      aria-controls={`log-technical-${index}`}
                    >
                      {isExpanded ? (
                        <>
                          <CaretUp size={14} weight="bold" />
                          Hide details
                        </>
                      ) : (
                        <>
                          <CaretDown size={14} weight="bold" />
                          Show details
                        </>
                      )}
                    </button>
                  )}
                </div>

                {hasTechnical && isExpanded && (
                  <div 
                    id={`log-technical-${index}`}
                    className="log-entry-technical"
                  >
                    <div className="technical-label">Technical:</div>
                    <div className="technical-content">{friendly.technical}</div>
                    {showTechnical && event.latencyMs !== undefined && (
                      <div className="technical-meta">
                        Latency: {event.latencyMs}ms • Actor: {event.actor}
                        {event.model && ` • Model: ${event.model}`}
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div className="log-entry-time">
                {(event.elapsedMs / 1000).toFixed(1)}s
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
