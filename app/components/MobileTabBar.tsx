/**
 * Task 8.37: Mobile tabbed interface for Map / Itinerary / Details
 * Task 8.42: Sticky action buttons for mobile
 */

import { MapTrifold, ListBullets, Info } from '@phosphor-icons/react';

export type MobileTab = 'map' | 'itinerary' | 'details';

interface MobileTabBarProps {
  activeTab: MobileTab;
  onTabChange: (tab: MobileTab) => void;
  className?: string;
}

export function MobileTabBar({ activeTab, onTabChange, className = '' }: MobileTabBarProps) {
  return (
    <div className={`mobile-tab-bar ${className}`} role="tablist">
      <button
        type="button"
        role="tab"
        aria-selected={activeTab === 'map'}
        aria-controls="mobile-tab-map"
        className={`mobile-tab ${activeTab === 'map' ? 'mobile-tab--active' : ''}`}
        onClick={() => onTabChange('map')}
      >
        <MapTrifold size={22} weight={activeTab === 'map' ? 'fill' : 'regular'} />
        <span>Map</span>
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={activeTab === 'itinerary'}
        aria-controls="mobile-tab-itinerary"
        className={`mobile-tab ${activeTab === 'itinerary' ? 'mobile-tab--active' : ''}`}
        onClick={() => onTabChange('itinerary')}
      >
        <ListBullets size={22} weight={activeTab === 'itinerary' ? 'fill' : 'regular'} />
        <span>Itinerary</span>
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={activeTab === 'details'}
        aria-controls="mobile-tab-details"
        className={`mobile-tab ${activeTab === 'details' ? 'mobile-tab--active' : ''}`}
        onClick={() => onTabChange('details')}
      >
        <Info size={22} weight={activeTab === 'details' ? 'fill' : 'regular'} />
        <span>Details</span>
      </button>
    </div>
  );
}
