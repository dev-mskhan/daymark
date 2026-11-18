"use client";

import { useState } from "react";
import { ArrowsOut, ArrowsIn, Eye, EyeSlash } from "@phosphor-icons/react";

interface MapControlsProps {
  onFullScreen?: () => void;
  isFullScreen?: boolean;
  onToggleRoute?: () => void;
  showRoute?: boolean;
}

export function MapControls({
  onFullScreen,
  isFullScreen = false,
  onToggleRoute,
  showRoute = true
}: MapControlsProps) {
  return (
    <div className="map-controls">
      {onFullScreen && (
        <button
          onClick={onFullScreen}
          className="map-control-button"
          title={isFullScreen ? "Exit full screen" : "Full screen"}
        >
          {isFullScreen ? <ArrowsIn size={20} /> : <ArrowsOut size={20} />}
        </button>
      )}
      {onToggleRoute && (
        <button
          onClick={onToggleRoute}
          className="map-control-button"
          title={showRoute ? "Hide route" : "Show route"}
        >
          {showRoute ? <Eye size={20} /> : <EyeSlash size={20} />}
        </button>
      )}

      <style jsx>{`
        .map-controls {
          position: absolute;
          top: 12px;
          right: 12px;
          display: flex;
          flex-direction: column;
          gap: 8px;
          z-index: 10;
        }

        .map-control-button {
          width: 40px;
          height: 40px;
          display: flex;
          align-items: center;
          justify-content: center;
          background: var(--panel);
          border: var(--stroke) solid var(--ink);
          border-radius: 8px;
          cursor: pointer;
          color: var(--ink);
          transition: all 0.15s var(--ease);
        }

        .map-control-button:hover {
          background: var(--ink);
          color: var(--bg);
          transform: scale(1.05);
        }

        .map-control-button:active {
          transform: scale(0.95);
        }
      `}</style>
    </div>
  );
}
