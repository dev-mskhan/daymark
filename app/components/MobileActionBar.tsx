/**
 * Task 8.42: Sticky action buttons (Save, Export, Share) for mobile
 */

import { FloppyDisk, DownloadSimple, ShareNetwork } from '@phosphor-icons/react';

interface MobileActionBarProps {
  onSave?: () => void;
  onExport?: () => void;
  onShare?: () => void;
  canSave?: boolean;
  canExport?: boolean;
  canShare?: boolean;
  className?: string;
}

export function MobileActionBar({
  onSave,
  onExport,
  onShare,
  canSave = true,
  canExport = true,
  canShare = false,
  className = '',
}: MobileActionBarProps) {
  return (
    <div className={`mobile-action-bar ${className}`}>
      {onSave && (
        <button
          type="button"
          className="mobile-action-button"
          onClick={onSave}
          disabled={!canSave}
          aria-label="Save trip"
        >
          <FloppyDisk size={20} weight="bold" />
          <span>Save</span>
        </button>
      )}
      {onExport && (
        <button
          type="button"
          className="mobile-action-button"
          onClick={onExport}
          disabled={!canExport}
          aria-label="Export itinerary"
        >
          <DownloadSimple size={20} weight="bold" />
          <span>Export</span>
        </button>
      )}
      {onShare && (
        <button
          type="button"
          className="mobile-action-button"
          onClick={onShare}
          disabled={!canShare}
          aria-label="Share trip"
        >
          <ShareNetwork size={20} weight="bold" />
          <span>Share</span>
        </button>
      )}
    </div>
  );
}
