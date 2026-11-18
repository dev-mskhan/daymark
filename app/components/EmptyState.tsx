"use client";

import { 
  MapTrifold, 
  Warning, 
  MagnifyingGlass,
  Suitcase 
} from "@phosphor-icons/react";

export type EmptyStateType = 'no-trips' | 'planning-failed' | 'no-results' | 'no-activities';

interface EmptyStateProps {
  type: EmptyStateType;
  message?: string;
  action?: {
    label: string;
    onClick: () => void;
  };
}

export function EmptyState({ type, message, action }: EmptyStateProps) {
  const getIcon = () => {
    switch (type) {
      case 'no-trips':
        return <Suitcase size={48} weight="duotone" />;
      case 'planning-failed':
        return <Warning size={48} weight="duotone" />;
      case 'no-results':
        return <MagnifyingGlass size={48} weight="duotone" />;
      case 'no-activities':
        return <MapTrifold size={48} weight="duotone" />;
    }
  };

  const getTitle = () => {
    switch (type) {
      case 'no-trips':
        return 'No saved trips yet';
      case 'planning-failed':
        return 'Planning didn\'t complete';
      case 'no-results':
        return 'No results found';
      case 'no-activities':
        return 'No activities yet';
    }
  };

  const getDefaultMessage = () => {
    switch (type) {
      case 'no-trips':
        return 'Create your first trip to get started. We\'ll help you plan the perfect day.';
      case 'planning-failed':
        return 'Something went wrong while planning your trip. Try adjusting your preferences or time window.';
      case 'no-results':
        return 'We couldn\'t find any places matching your search. Try different criteria.';
      case 'no-activities':
        return 'Start planning to see your itinerary here.';
    }
  };

  return (
    <div className="empty-state">
      <div className="empty-state-icon">{getIcon()}</div>
      <h3 className="empty-state-title">{getTitle()}</h3>
      <p className="empty-state-message">{message || getDefaultMessage()}</p>
      {action && (
        <button onClick={action.onClick} className="pill-button">
          {action.label}
        </button>
      )}

      <style jsx>{`
        .empty-state {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding: 64px 32px;
          text-align: center;
          max-width: 480px;
          margin: 0 auto;
        }

        .empty-state-icon {
          width: 96px;
          height: 96px;
          display: flex;
          align-items: center;
          justify-content: center;
          background: var(--panel);
          border: var(--stroke) solid var(--line);
          border-radius: 50%;
          color: var(--muted);
          margin-bottom: 24px;
        }

        .empty-state-title {
          font-size: 24px;
          font-weight: 600;
          margin: 0 0 12px 0;
          color: var(--ink);
        }

        .empty-state-message {
          font-size: 16px;
          line-height: 1.5;
          margin: 0 0 24px 0;
          color: var(--muted);
        }
      `}</style>
    </div>
  );
}
