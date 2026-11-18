/**
 * Task 8.43: Skip links for keyboard navigation
 */

export function SkipLinks() {
  return (
    <div className="skip-links">
      <a href="#main-content" className="skip-link">
        Skip to main content
      </a>
      <a href="#trip-form" className="skip-link">
        Skip to trip form
      </a>
      <a href="#itinerary" className="skip-link">
        Skip to itinerary
      </a>
      <a href="#activity-log" className="skip-link">
        Skip to activity log
      </a>
    </div>
  );
}
