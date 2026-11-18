/**
 * Task 8.45: Live region for progress announcements (aria-live)
 */

import { useEffect, useRef } from 'react';

interface LiveRegionProps {
  message: string;
  politeness?: 'polite' | 'assertive';
}

export function LiveRegion({ message, politeness = 'polite' }: LiveRegionProps) {
  const prevMessageRef = useRef('');

  useEffect(() => {
    // Only announce when message actually changes
    prevMessageRef.current = message;
  }, [message]);

  return (
    <div
      role="status"
      aria-live={politeness}
      aria-atomic="true"
      className="sr-only"
    >
      {message}
    </div>
  );
}
