"use client";

import { CheckCircle, Clock, MapPin, Sparkle } from "@phosphor-icons/react";

export interface ProgressStage {
  stage: 'geocoding' | 'discovering' | 'screening' | 'planning' | 'reviewing' | 'complete';
  message: string;
  progress: number; // 0-100
  placesFound?: number;
  stopsPlanned?: number;
}

interface ProgressBarProps {
  stage: ProgressStage;
}

export function ProgressBar({ stage }: ProgressBarProps) {
  const getIcon = () => {
    switch (stage.stage) {
      case 'geocoding':
        return <MapPin size={20} weight="duotone" />;
      case 'discovering':
      case 'screening':
        return <Sparkle size={20} weight="duotone" />;
      case 'planning':
      case 'reviewing':
        return <Clock size={20} weight="duotone" />;
      case 'complete':
        return <CheckCircle size={20} weight="duotone" />;
    }
  };

  const getStageLabel = () => {
    switch (stage.stage) {
      case 'geocoding':
        return 'Finding your location';
      case 'discovering':
        return 'Discovering places';
      case 'screening':
        return 'Screening candidates';
      case 'planning':
        return 'Planning your day';
      case 'reviewing':
        return 'Reviewing itinerary';
      case 'complete':
        return 'Complete';
    }
  };

  return (
    <div className="progress-container" role="status" aria-live="polite">
      <div className="progress-header">
        <div className="progress-icon">{getIcon()}</div>
        <div className="progress-text">
          <h3 className="progress-stage">{getStageLabel()}</h3>
          <p className="progress-message">{stage.message}</p>
        </div>
      </div>

      <div className="progress-bar-track">
        <div 
          className="progress-bar-fill" 
          style={{ width: `${stage.progress}%` }}
          role="progressbar"
          aria-valuenow={stage.progress}
          aria-valuemin={0}
          aria-valuemax={100}
        />
      </div>

      {(stage.placesFound !== undefined || stage.stopsPlanned !== undefined) && (
        <div className="progress-stats">
          {stage.placesFound !== undefined && (
            <span className="progress-stat">
              {stage.placesFound} places found
            </span>
          )}
          {stage.stopsPlanned !== undefined && (
            <span className="progress-stat">
              {stage.stopsPlanned} stops planned
            </span>
          )}
        </div>
      )}

      <style jsx>{`
        .progress-container {
          padding: 20px;
          background: var(--panel);
          border: var(--stroke) solid var(--line);
          border-radius: 16px;
          margin: 16px 0;
        }

        .progress-header {
          display: flex;
          align-items: flex-start;
          gap: 16px;
          margin-bottom: 16px;
        }

        .progress-icon {
          width: 44px;
          height: 44px;
          display: flex;
          align-items: center;
          justify-content: center;
          background: var(--accent);
          color: var(--on-accent);
          border-radius: 50%;
          flex-shrink: 0;
        }

        .progress-text {
          flex: 1;
          min-width: 0;
        }

        .progress-stage {
          font-size: 18px;
          font-weight: 600;
          margin: 0 0 4px 0;
          color: var(--ink);
        }

        .progress-message {
          font-size: 14px;
          margin: 0;
          color: var(--muted);
          line-height: 1.4;
        }

        .progress-bar-track {
          height: 8px;
          background: var(--line);
          border-radius: 999px;
          overflow: hidden;
          margin-bottom: 12px;
        }

        .progress-bar-fill {
          height: 100%;
          background: var(--accent);
          border-radius: 999px;
          transition: width 0.4s var(--ease);
        }

        .progress-stats {
          display: flex;
          gap: 16px;
          flex-wrap: wrap;
        }

        .progress-stat {
          font-size: 13px;
          font-weight: 600;
          color: var(--muted);
        }
      `}</style>
    </div>
  );
}
