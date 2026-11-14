"use client";

/**
 * DayAccordion — collapsible per-day section for multi-day itineraries.
 * Tasks 4.23–4.26, 4.28
 */

import { useState } from "react";
import { CaretDown, CaretRight, MapPin, Moon } from "@phosphor-icons/react";
import type { DaySegment } from "@/lib/domain";
import { DayDial, type DialStop } from "./DayDial";

function toMinutes(time: string): number | null {
  const [h, m] = time.split(":").map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
  return h * 60 + m;
}

function buildDialStops(segment: DaySegment, startTime: string): DialStop[] {
  const windowStart = toMinutes(startTime);
  if (windowStart === null) return [];
  const routes = segment.snapshot.routes;
  const firstLegMins = segment.snapshot.firstLeg?.selected?.durationMinutes ?? 0;
  let offset = firstLegMins;
  return segment.snapshot.activities.map((activity, i) => {
    if (i > 0) offset += routes[i - 1] ?? 0;
    const stop: DialStop = {
      index: i + 1,
      start: windowStart + offset,
      duration: activity.durationMinutes,
    };
    offset += activity.durationMinutes;
    return stop;
  });
}

interface DayAccordionProps {
  segments: DaySegment[];
  startTimes: string[];   // HH:MM per day, parallel to segments
  endTimes: string[];
  activeDay: number;      // 1-based day number currently shown
  onDayChange: (day: number) => void;
  /** Called with place name from candidates for map hover */
  onActivityHover?: (placeId: string | null) => void;
  candidateName: (placeId: string) => string;
}

export function DayAccordion({
  segments,
  startTimes,
  endTimes,
  activeDay,
  onDayChange,
  onActivityHover,
  candidateName,
}: DayAccordionProps) {
  return (
    <div className="day-accordion" role="tablist" aria-label="Trip days">
      {segments.map((segment, idx) => {
        const dayNum = segment.dayNumber;
        const isOpen = activeDay === dayNum;
        const startTime = startTimes[idx] ?? "09:00";
        const endTime = endTimes[idx] ?? "19:00";
        const dialStops = buildDialStops(segment, startTime);
        const flagCount = segment.snapshot.issues.filter(i => i.status === "flag").length;

        return (
          <div
            key={dayNum}
            className={`day-accordion-item ${isOpen ? "day-accordion-item--open" : ""}`}
          >
            {/* Task 4.25: Day boundary indicator with date label */}
            <button
              className="day-accordion-header"
              role="tab"
              aria-selected={isOpen}
              aria-controls={`day-panel-${dayNum}`}
              id={`day-tab-${dayNum}`}
              onClick={() => onDayChange(dayNum)}
            >
              <span className="day-accordion-caret">
                {isOpen ? <CaretDown size={16} /> : <CaretRight size={16} />}
              </span>
              <span className="day-accordion-label">
                Day {dayNum}
                <span className="day-accordion-date">{segment.snapshot.activities.length > 0 ? ` · ${segment.snapshot.activities.length} stops` : " · No stops yet"}</span>
              </span>
              {flagCount > 0 && (
                <span className="day-accordion-flag" aria-label={`${flagCount} issue${flagCount > 1 ? "s" : ""}`}>
                  ⚠ {flagCount}
                </span>
              )}
              {/* Task 4.26: Overnight indicator */}
              {segment.endingAt && (
                <span className="day-accordion-overnight" title={`Overnight: ${segment.endingAt}`}>
                  <Moon size={14} weight="fill" />
                </span>
              )}
            </button>

            {isOpen && (
              <div
                className="day-accordion-panel"
                role="tabpanel"
                id={`day-panel-${dayNum}`}
                aria-labelledby={`day-tab-${dayNum}`}
              >
                {/* Task 4.24: One DayDial per day */}
                <div className="day-accordion-dial">
                  <DayDial
                    start={toMinutes(startTime)}
                    end={toMinutes(endTime)}
                    stops={dialStops}
                  />
                </div>

                {/* Starting-from indicator */}
                <p className="day-accordion-origin">
                  <MapPin size={14} />
                  Starts from: <strong>{segment.startingFrom}</strong>
                </p>

                {/* Activity list */}
                <div className="day-accordion-activities">
                  {segment.snapshot.activities.map((activity, i) => {
                    const hasIssue = segment.snapshot.issues.some(
                      is => is.subjectIds.includes(activity.id) && is.status === "flag",
                    );
                    return (
                      <div
                        key={activity.id}
                        className={`day-accordion-activity ${hasIssue ? "day-accordion-activity--flagged" : ""}`}
                        onMouseEnter={() => onActivityHover?.(activity.placeId)}
                        onMouseLeave={() => onActivityHover?.(null)}
                      >
                        <span className="day-accordion-activity-num">{i + 1}</span>
                        <span className="day-accordion-activity-name">
                          {candidateName(activity.placeId)}
                        </span>
                        <span className="day-accordion-activity-dur">
                          {activity.durationMinutes} min
                        </span>
                      </div>
                    );
                  })}
                  {!segment.snapshot.activities.length && (
                    <p className="day-accordion-empty">Planning in progress…</p>
                  )}
                </div>

                {/* Task 4.26: Overnight location marker */}
                {segment.endingAt && (
                  <div className="day-accordion-overnight-marker">
                    <Moon size={16} weight="fill" />
                    <span>Overnight: <strong>{segment.endingAt}</strong></span>
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
