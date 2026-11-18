"use client";

import { useState, DragEvent } from "react";
import {
  ArrowUpRight,
  PersonSimpleWalk,
  Train,
  WarningCircle,
  Trash,
  Clock,
  DotsSixVertical,
} from "@phosphor-icons/react";
import type { Activity, Issue, Place, TransportOption } from "@/lib/domain";

interface ActivityCardProps {
  activity: Activity;
  index: number;
  startTime: string;
  place?: Place;
  issues: Issue[];
  transport?: TransportOption | null;
  travelMinutes?: number | null;
  placeHref?: string;
  onHover?: (placeId: string | null) => void;
  editable?: boolean;
  onRemove?: () => void;
  onAdjustDuration?: (minutes: number) => void;
  onReorderUp?: () => void;
  onReorderDown?: () => void;
  draggable?: boolean;
  onDragStart?: (index: number) => void;
  onDragOver?: (index: number) => void;
  onDrop?: (index: number) => void;
  isDragTarget?: boolean;
}

export function ActivityCard({
  activity,
  index,
  startTime,
  place,
  issues,
  transport,
  travelMinutes,
  placeHref,
  onHover,
  editable = false,
  onRemove,
  onAdjustDuration,
  onReorderUp,
  onReorderDown,
  draggable = false,
  onDragStart,
  onDragOver,
  onDrop,
  isDragTarget = false,
}: ActivityCardProps) {
  const flagged = issues.some((issue) => issue.status === "flag");
  const [editingDuration, setEditingDuration] = useState(false);
  const [durationValue, setDurationValue] = useState(activity.durationMinutes);

  const handleDragStart = (e: DragEvent<HTMLDivElement>) => {
    if (draggable && onDragStart) {
      e.dataTransfer.effectAllowed = "move";
      onDragStart(index);
    }
  };

  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    if (draggable && onDragOver) {
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      onDragOver(index);
    }
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    if (draggable && onDrop) {
      e.preventDefault();
      onDrop(index);
    }
  };

  return (
    <article
      className={`activity ${isDragTarget ? 'drag-target' : ''}`}
      onMouseEnter={() => onHover?.(activity.placeId)}
      onMouseLeave={() => onHover?.(null)}
      draggable={draggable}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      <time>{startTime}</time>
      <div className="timeline-node">
        {draggable && (
          <div className="drag-handle" title="Drag to reorder">
            <DotsSixVertical size={20} weight="bold" />
          </div>
        )}
        <span>{index + 1}</span>
      </div>
      <div className={`activity-body ${flagged ? "flagged" : ""}`}>
        {index > 0 && (
          <p className="travel">
            {transport?.mode === "transit" ? (
              <Train size={18} />
            ) : (
              <PersonSimpleWalk size={18} />
            )}
            {transport?.mode === "transit"
              ? `Transit ${transport.durationMinutes} min, ${transport.walkingMinutes} min on foot${transport.transfers ? `, ${transport.transfers} transfer${transport.transfers > 1 ? "s" : ""}` : ""}`
              : `Walk ${travelMinutes ?? "unknown"} min`}
          </p>
        )}
        {transport?.lines.length ? (
          <p className="travel-lines">{transport.lines.join(", then ")}</p>
        ) : null}
        <h3>{place?.name ?? activity.placeId}</h3>
        <p className="stay">Stay about {activity.durationMinutes} min</p>
        <details className="activity-details">
          <summary>Why this stop?</summary>
          <p className="reason">{activity.reason}</p>
          {issues.some((issue) => issue.evidence?.length) && (
            <ul>
              {issues.flatMap((issue) =>
                (issue.evidence ?? []).map((fact, factIndex) => (
                  <li key={`${issue.checkId}-${factIndex}`}>{fact}</li>
                )),
              )}
            </ul>
          )}
        </details>
        {place && (
          <div className="verification-badges">
            {place.formattedOpeningHours && (
              <span
                className="badge badge-verified"
                title={`Opening hours verified${place.lastVerified ? ` as of ${new Date(place.lastVerified).toLocaleDateString()}` : ""}`}
              >
                ✓ Hours verified
              </span>
            )}
            {place.operationalStatus === "operational" && (
              <span
                className="badge badge-verified"
                title="Place is confirmed operational"
              >
                ✓ Open
              </span>
            )}
            {place.operationalStatus === "temporarily_closed" && (
              <span
                className="badge badge-warning"
                title="Place is temporarily closed"
              >
                ⚠ Temp. closed
              </span>
            )}
            {place.operationalStatus === "permanently_closed" && (
              <span
                className="badge badge-warning"
                title="Place is permanently closed"
              >
                ✗ Closed permanently
              </span>
            )}
            {place.accessibilityInfo?.wheelchairAccessible && (
              <span
                className="badge badge-info"
                title="Wheelchair accessible"
              >
                ♿ Accessible
              </span>
            )}
            {place.timezone && (
              <span
                className="badge badge-info"
                title={`Timezone: ${place.timezone}`}
              >
                🕐 {place.timezone.split("/").pop()?.replace("_", " ")}
              </span>
            )}
          </div>
        )}
        {place && place.source !== "demo" && placeHref && (
          <a
            className="source-link"
            href={placeHref}
            target="_blank"
            rel="noreferrer"
          >
            View on OpenStreetMap
            <ArrowUpRight size={14} />
          </a>
        )}
        {place?.types.length ? (
          <div className="tags">
            {place.types.map((type) => (
              <span key={type}>{type}</span>
            ))}
          </div>
        ) : null}
        {issues.map((issue) => (
          <p
            className="issue"
            key={`${issue.checkId}${issue.subjectIds.join(",")}${issue.message}`}
          >
            <WarningCircle size={18} />
            {issue.message}
          </p>
        ))}
        
        {editable && (
          <div className="activity-edit-actions">
            {!editingDuration ? (
              <>
                {draggable && index > 0 && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onReorderUp?.();
                    }}
                    className="edit-action-button"
                    title="Move up"
                  >
                    ↑ Move up
                  </button>
                )}
                {draggable && onReorderDown && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onReorderDown();
                    }}
                    className="edit-action-button"
                    title="Move down"
                  >
                    ↓ Move down
                  </button>
                )}
                <button
                  onClick={() => setEditingDuration(true)}
                  className="edit-action-button"
                  title="Adjust time at this stop"
                >
                  <Clock size={16} />
                  <span>{activity.durationMinutes} min</span>
                </button>
                <button
                  onClick={onRemove}
                  className="edit-action-button edit-action-danger"
                  title="Remove this stop"
                >
                  <Trash size={16} />
                  <span>Remove</span>
                </button>
              </>
            ) : (
              <div className="duration-editor">
                <label>
                  <span>Time at this stop:</span>
                  <input
                    type="range"
                    min="15"
                    max="180"
                    step="15"
                    value={durationValue}
                    onChange={(e) => setDurationValue(Number(e.target.value))}
                  />
                  <output>{durationValue} minutes</output>
                </label>
                <div className="duration-editor-buttons">
                  <button
                    onClick={() => {
                      onAdjustDuration?.(durationValue);
                      setEditingDuration(false);
                    }}
                    className="pill-button"
                  >
                    Save
                  </button>
                  <button
                    onClick={() => {
                      setDurationValue(activity.durationMinutes);
                      setEditingDuration(false);
                    }}
                    className="pill-button"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </article>
  );
}
