/**
 * Task 8.34-8.35: Welcome banner for first-time users with dismiss
 * Task 8.36: Quick start templates
 */

import { useState, useEffect } from 'react';
import { X, Sparkle, MapPin, Heart, Tree } from '@phosphor-icons/react';
import type { ReactNode } from 'react';

const BANNER_DISMISSED_KEY = 'daymark:welcomeDismissed';

interface QuickTemplate {
  icon: ReactNode;
  title: string;
  destination: string;
  preference: string;
  constraints: string;
}

const templates: QuickTemplate[] = [
  {
    icon: <Sparkle size={24} weight="duotone" />,
    title: 'Museum Day',
    destination: 'New York City',
    preference: 'I love art and history. Include 2-3 museums with time to explore each one. Mix major attractions with hidden gems.',
    constraints: 'Keep travel time under 30 minutes between stops. Leave time for lunch at a museum cafe.',
  },
  {
    icon: <Heart size={24} weight="duotone" />,
    title: 'Foodie Tour',
    destination: 'Brooklyn, New York',
    preference: 'I want to discover the best local food spots. Include diverse cuisines, food markets, and unique eateries.',
    constraints: 'Avoid chain restaurants. Keep the pace relaxed with time to enjoy each meal.',
  },
  {
    icon: <Tree size={24} weight="duotone" />,
    title: 'Nature Escape',
    destination: 'Portland, Oregon',
    preference: 'I love outdoor activities and natural beauty. Include parks, gardens, and scenic viewpoints.',
    constraints: 'Prioritize places with accessible walking trails. Avoid crowded tourist spots.',
  },
];

interface WelcomeBannerProps {
  onSelectTemplate?: (template: Omit<QuickTemplate, 'icon' | 'title'>) => void;
}

export function WelcomeBanner({ onSelectTemplate }: WelcomeBannerProps) {
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    try {
      const wasDismissed = localStorage.getItem(BANNER_DISMISSED_KEY);
      setDismissed(wasDismissed === 'true');
    } catch {
      setDismissed(false);
    }
  }, []);

  const handleDismiss = () => {
    setDismissed(true);
    try {
      localStorage.setItem(BANNER_DISMISSED_KEY, 'true');
    } catch {
      // Silent fail
    }
  };

  if (dismissed) return null;

  return (
    <div className="welcome-banner">
      <button
        type="button"
        className="welcome-banner-close"
        onClick={handleDismiss}
        aria-label="Dismiss welcome message"
      >
        <X size={20} weight="bold" />
      </button>

      <div className="welcome-banner-content">
        <div className="welcome-banner-header">
          <MapPin size={32} weight="duotone" className="welcome-banner-icon" />
          <div>
            <h2 className="welcome-banner-title">Welcome to Daymark</h2>
            <p className="welcome-banner-subtitle">
              Plan your perfect day in minutes with AI-powered itineraries, verified opening hours, and smart routing.
            </p>
          </div>
        </div>

        <div className="welcome-banner-features">
          <div className="feature-item">
            <span className="feature-icon">✓</span>
            <span>Multi-day trip planning</span>
          </div>
          <div className="feature-item">
            <span className="feature-icon">✓</span>
            <span>Opening hours verified</span>
          </div>
          <div className="feature-item">
            <span className="feature-icon">✓</span>
            <span>Accessibility checks</span>
          </div>
          <div className="feature-item">
            <span className="feature-icon">✓</span>
            <span>Drag & drop reordering</span>
          </div>
        </div>

        <div className="welcome-banner-templates">
          <h3 className="templates-title">Quick Start Templates</h3>
          <div className="templates-grid">
            {templates.map((template, index) => (
              <button
                key={index}
                type="button"
                className="template-card"
                onClick={() => {
                  onSelectTemplate?.({
                    destination: template.destination,
                    preference: template.preference,
                    constraints: template.constraints,
                  });
                  handleDismiss();
                }}
              >
                <div className="template-icon">{template.icon}</div>
                <div className="template-title">{template.title}</div>
                <div className="template-destination">{template.destination}</div>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
