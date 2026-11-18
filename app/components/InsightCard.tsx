/**
 * Task 8.19-8.22: InsightCard component for statistics
 */

import type { ReactNode } from 'react';

interface InsightCardProps {
  icon: ReactNode;
  value: string | number;
  label: string;
  description?: string;
  className?: string;
}

export function InsightCard({ icon, value, label, description, className = '' }: InsightCardProps) {
  return (
    <div className={`insight-card ${className}`}>
      <div className="insight-icon">{icon}</div>
      <div className="insight-content">
        <div className="insight-value">{value}</div>
        <div className="insight-label">{label}</div>
        {description && <div className="insight-description">{description}</div>}
      </div>
    </div>
  );
}

/**
 * Task 8.22: Translate pace labels to human-friendly text
 */
export function translatePaceLabel(pace: string): string {
  const translations: Record<string, string> = {
    very_full: 'Packed',
    full: 'Busy',
    moderate: 'Moderate',
    relaxed: 'Relaxed',
    leisurely: 'Leisurely',
  };
  
  return translations[pace] || pace;
}
``