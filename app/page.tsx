"use client";

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  CheckCircle,
  ChatCircleText,
  DownloadSimple,
  FloppyDisk,
  GithubLogo,
  Info,
  Pause,
  PersonSimpleWalk,
  Play,
  Plus,
  Moon,
  SealCheck,
  Stop,
  Sun,
  Train,
  WarningCircle,
  X,
} from "@phosphor-icons/react";
import type {
  Activity,
  DaySegment,
  MultiDayRequest,
  Place,
  RunEvent,
  Snapshot,
} from "@/lib/domain";
import { buildSchedule, formatTime, toMinutes } from "@/lib/schedule";
import {
  buildPreferenceVerdicts,
  computeBreakBlocks,
  type BreakBlock,
  type PreferenceVerdict,
} from "@/lib/preference-compliance";
import { LeafletMap } from "@/app/components/LeafletMap";
import { DayDial, type DialStop } from "@/app/components/DayDial";
import { DayAccordion } from "@/app/components/DayAccordion";
import { AccountMenu } from "@/app/components/AccountMenu";
import { useAccount } from "@/lib/auth/use-account";

const defaults = {
  origin: "Penn Station, New York City",
  destination: "New York City",
  days: [
    {
      date: "2026-10-12",
      startTime: "09:00",
      endTime: "19:00",
    },
    {
      date: "2026-10-13",
      startTime: "09:00",
      endTime: "18:00",
    }
  ],
  partySize: 1,
  preference:
    "I enjoy art, local neighborhoods and food. Include one art museum but avoid repetitive museum visits. Keep the day relaxed.",
  constraints:
    "Avoid long cross-city transfers and keep at least one relaxed break.",
};

const liveDefaults = { 
  origin: "",
  destination: "Brooklyn, New York", 
  days: [
    {
      date: new Date().toISOString().split('T')[0],
      startTime: "09:00",
      endTime: "19:00",
    }
  ],
  partySize: 1,
  preference: "I enjoy art, local food, and discovering hidden gems. Keep the pace relaxed.",
  constraints: "Avoid crowded tourist traps."
};

export default function Home() {
  const [form, setForm] = useState(defaults);
  const [mode, setMode] = useState<"fixture" | "live">("fixture");
  const [events, setEvents] = useState<RunEvent[]>([]);
  const [candidates, setCandidates] = useState<Place[]>([]);
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(false);
  const [started, setStarted] = useState(false);
  const [error, setError] = useState("");
  const [cursor, setCursor] = useState<number | null>(null);
  const [replaying, setReplaying] = useState(false);
  const [accepted, setAccepted] = useState<Snapshot | null>(null);
  const [showCoverage, setShowCoverage] = useState(false);
  const [coverageDismissed, setCoverageDismissed] = useState(false);
  const [isDarkTheme, setIsDarkTheme] = useState(false);
  const [themeStorageWarning, setThemeStorageWarning] = useState("");
  const themePreference = useRef<"system" | "light" | "dark">("system");
  // Multi-day state (Task 4.27-4.28)
  const [multiDaySegments, setMultiDaySegments] = useState<DaySegment[]>([]);
  const [activeDay, setActiveDay] = useState(1);
  const abort = useRef<AbortController | null>(null);
  const run = useRef(0);
  const shown = cursor === null ? events : events.slice(0, cursor + 1);
  const displayed =
    cursor === null
      ? snapshot
      : ([...shown].reverse().find((e) => e.snapshot)?.snapshot ?? null);
  const activities = displayed?.activities ?? [];
  const points = useMemo(
    () =>
      activities.flatMap((a) => {
        const p = candidates.find((p) => p.id === a.placeId);
        return p ? [p] : [];
      }),
    [activities, candidates],
  );
  const positions = useMemo(() => plotPositions(points), [points]);
  const lastLLM = [...shown].reverse().find((e) => e.actor === "LLM");
  const lastJev = [...shown].reverse().find((e) => e.actor === "Jev");
  const reviews = shown.filter((e) => e.review);
  const repairs = shown.filter((e) => e.type === "repair_diff");
  const averageReview = reviews.length
    ? reviews.reduce((sum, e) => sum + (e.latencyMs ?? 0), 0) / reviews.length
    : null;
  const name = (id: string) => candidates.find((p) => p.id === id)?.name ?? id;
  const windowStart = toMinutes(form.days[0].startTime);
  const windowEnd = toMinutes(form.days[0].endTime);
  // Phase 1.1: Pass firstLegMinutes so stop 1 arrival = windowStart + firstLeg
  const firstLegMinutes = displayed?.firstLeg?.selected?.durationMinutes ?? (displayed?.origin ? null : 0);
  const schedule = buildSchedule(activities, displayed?.routes ?? [], firstLegMinutes);

  // Phase 1.6: Unused time notice
  const lastActivityEnd: number | null = (() => {
    if (!activities.length || windowStart === null) return null;
    const lastOffset = schedule[activities.length - 1];
    if (lastOffset === null) return null;
    return lastOffset + activities[activities.length - 1].durationMinutes;
  })();

  // Phase 1.4: Preference compliance verdicts
  const preferenceVerdicts = useMemo(
    () =>
      !loading && activities.length
        ? buildPreferenceVerdicts(
            form.preference,
            form.constraints,
            activities,
            candidates,
            displayed?.routes ?? [],
          )
        : [],
    [loading, activities, candidates, displayed?.routes, form.preference, form.constraints],
  );

  // Phase 1.5: Break blocks for display
  const breakBlocks = useMemo(
    () =>
      windowStart !== null
        ? computeBreakBlocks(
            activities,
            schedule,
            windowStart,
            form.preference,
            form.constraints,
          )
        : [],
    [activities, schedule, windowStart, form.preference, form.constraints],
  );
  const dialStops: DialStop[] = [];
  activities.forEach((a, i) => {
    const offset = schedule[i];
    if (windowStart !== null && offset !== null)
      dialStops.push({
        index: i + 1,
        start: windowStart + offset,
        duration: a.durationMinutes,
      });
  });

  useEffect(() => {
    if (!replaying || cursor === null) return;
    if (cursor >= events.length - 1) {
      setReplaying(false);
      return;
    }
    const timer = window.setTimeout(
      () =>
        setCursor((value) =>
          value === null ? 0 : Math.min(value + 1, events.length - 1),
        ),
      550,
    );
    return () => window.clearTimeout(timer);
  }, [cursor, events.length, replaying]);

  const applyTheme = useCallback(() => {
    const isDark =
      themePreference.current === "system"
        ? window.matchMedia("(prefers-color-scheme: dark)").matches
        : themePreference.current === "dark";
    document.documentElement.dataset.theme = isDark ? "dark" : "light";
    setIsDarkTheme(isDark);
  }, []);

  useEffect(() => {
    const colorScheme = window.matchMedia("(prefers-color-scheme: dark)");
    try {
      const saved = window.localStorage.getItem("daymark-theme");
      if (saved === "light" || saved === "dark") themePreference.current = saved;
    } catch {
      setThemeStorageWarning(
        "Theme preference storage is unavailable; using the system preference.",
      );
    }
    applyTheme();
    colorScheme.addEventListener("change", applyTheme);
    return () => colorScheme.removeEventListener("change", applyTheme);
  }, [applyTheme]);

  // Task 5.18: signed-in users keep their theme preference on their profile.
  const account = useAccount();
  const accountId = account.user?.id;
  useEffect(() => {
    if (!accountId) return;
    let cancelled = false;
    (async () => {
      const response = await fetch("/api/profile");
      if (!response.ok || cancelled) return;
      const saved = (await response.json()).profile?.themePreference as
        | "system"
        | "light"
        | "dark"
        | undefined;
      if (!saved || cancelled) return;
      if (saved === "system" && themePreference.current !== "system") {
        // First sign-in on a device with a chosen theme: keep it and store it on the profile.
        await fetch("/api/profile", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ themePreference: themePreference.current }),
        });
        return;
      }
      themePreference.current = saved;
      try {
        if (saved === "system") window.localStorage.removeItem("daymark-theme");
        else window.localStorage.setItem("daymark-theme", saved);
      } catch {
        /* the profile remains the source of truth */
      }
      applyTheme();
    })().catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [accountId, applyTheme]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    abort.current?.abort();
    const generation = ++run.current;
    const controller = new AbortController();
    abort.current = controller;
    setError("");
    setEvents([]);
    setCandidates([]);
    setSnapshot(null);
    setCursor(null);
    setReplaying(false);
    setAccepted(null);
    setMultiDaySegments([]);
    let receivedCandidates = false;
    try {
      if (mode === "live") {
        setChecking(true);
        const screeningResponse = await fetch("/api/screen", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: controller.signal,
          body: JSON.stringify({
            destination: form.destination,
            preference: form.preference,
          }),
        });
        const screening = (await screeningResponse.json()) as {
          allowed?: boolean;
          message?: string;
          error?: string;
        };
        if (!screeningResponse.ok)
          throw new Error(screening.error ?? "Could not check this request.");
        if (!screening.allowed) {
          setError(
            screening.message ??
              "Please narrow this request to one day in one city.",
          );
          return;
        }
      }
      if (generation !== run.current) return;
      setChecking(false);
      setStarted(true);
      setLoading(true);
      const isMultiDay = form.days.length > 1;
      const response = await fetch(isMultiDay ? "/api/multiday-plan" : "/api/plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: isMultiDay
          ? JSON.stringify({
              origin: form.origin,
              destination: form.destination,
              partySize: form.partySize,
              preference: form.preference,
              constraints: form.constraints,
              days: form.days.map((day, i) => ({
                dayNumber: i + 1,
                date: day.date,
                startTime: day.startTime,
                endTime: day.endTime,
              })),
              mode,
            })
          : JSON.stringify({
              origin: form.origin,
              destination: form.destination,
              partySize: form.partySize,
              preference: form.preference,
              constraints: form.constraints,
              startAt: `${form.days[0].date}T${form.days[0].startTime}:00`,
              endAt: `${form.days[0].date}T${form.days[0].endTime}:00`,
              mode,
            }),
      });
      if (!response.ok)
        throw new Error((await response.json()).error ?? "Planning failed");
      const reader = response.body!.getReader(),
        decoder = new TextDecoder();
      let buffer = "";
      // Track per-day segments for multi-day
      const daySegmentMap = new Map<number, { candidates: Place[]; snapshot: Snapshot; events: RunEvent[] }>();
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop()!;
        for (const line of lines) {
          if (!line || generation !== run.current) continue;
          const update = JSON.parse(line) as RunEvent & { dayNumber?: number };
          if (update.type === "error") throw new Error(update.message);
          setEvents((previous) => [...previous, update]);
          if (update.candidates) {
            receivedCandidates = true;
            setCandidates(update.candidates);
            if (isMultiDay && update.dayNumber) {
              const existing = daySegmentMap.get(update.dayNumber) ?? { candidates: [], snapshot: null as unknown as Snapshot, events: [] };
              daySegmentMap.set(update.dayNumber, { ...existing, candidates: update.candidates });
            }
          }
          if (update.snapshot) {
            setSnapshot(update.snapshot);
            if (isMultiDay && update.dayNumber) {
              const existing = daySegmentMap.get(update.dayNumber) ?? { candidates: [], snapshot: update.snapshot, events: [] };
              daySegmentMap.set(update.dayNumber, { ...existing, snapshot: update.snapshot });
            }
          }
          // Build multiDaySegments progressively
          if (isMultiDay && daySegmentMap.size > 0) {
            const segments = Array.from(daySegmentMap.entries())
              .sort(([a], [b]) => a - b)
              .filter(([, seg]) => seg.snapshot)
              .map(([dayNumber, seg]) => ({
                dayNumber,
                startingFrom: form.days[dayNumber - 1]?.date ?? '',
                snapshot: seg.snapshot,
                candidates: seg.candidates,
                events: seg.events,
              }));
            if (segments.length > 0) setMultiDaySegments(segments);
          }
        }
      }
    } catch (caught) {
      if (generation === run.current) {
        if (!controller.signal.aborted)
          setStarted(false);
        setError(
          controller.signal.aborted
            ? "Planning stopped. The last committed draft is preserved."
            : caught instanceof Error
              ? caught.message
              : "Planning failed",
        );
      }
    } finally {
      if (generation === run.current) {
        setChecking(false);
        setLoading(false);
      }
    }
  }

  function exportRun() {
    const url = URL.createObjectURL(
      new Blob([JSON.stringify({ mode, request: form, events }, null, 2)], {
        type: "application/json",
      }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = "daymark-run.json";
    link.click();
    URL.revokeObjectURL(url);
  }
  function startReplay() {
    if (!events.length) return;
    setCursor(0);
    setReplaying(true);
  }
  function chooseMode(next: "fixture" | "live") {
    setMode(next);
    const newDefaults = next === "live" ? liveDefaults : defaults;
    setForm(newDefaults);
    setError("");
    setShowCoverage(next === "live" && !coverageDismissed);
  }

  function toggleTheme() {
    const next = isDarkTheme ? "light" : "dark";
    themePreference.current = next;
    document.documentElement.dataset.theme = next;
    setIsDarkTheme(next === "dark");
    try {
      window.localStorage.setItem("daymark-theme", next);
      setThemeStorageWarning("");
    } catch {
      setThemeStorageWarning(
        "Theme changed for this session, but the preference could not be saved.",
      );
    }
    if (account.user)
      fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ themePreference: next }),
      })
        .then((response) => {
          if (!response.ok) throw new Error("save failed");
        })
        .catch(() =>
          setThemeStorageWarning(
            "Theme changed, but it could not be saved to your account.",
          ),
        );
  }

  return (
    <main>
      <header className="site-nav">
        <div className="brand">
          <span className="brand-mark">D</span>Daymark
        </div>
        <div className="nav-actions">
          <button
            className="icon-button"
            type="button"
            onClick={toggleTheme}
            aria-label={`Switch to ${isDarkTheme ? "light" : "dark"} theme`}
            title={`Switch to ${isDarkTheme ? "light" : "dark"} theme`}
          >
            {isDarkTheme ? <Sun size={21} /> : <Moon size={21} />}
          </button>
          <span className="visually-hidden" role="status">
            {themeStorageWarning}
          </span>
          <AccountMenu account={account} />
          <a
            className="icon-button"
            href="https://github.com/dev-mskhan/daymark"
            target="_blank"
            rel="noreferrer"
            aria-label="View Daymark on GitHub"
          >
            <GithubLogo size={22} weight="regular" />
          </a>
        </div>
      </header>

      {!started ? (
        <section className="landing">
          <div className="landing-copy">
            <h1>One day, planned stop by stop.</h1>
            <p className="lede">
              An LLM proposes each stop. Jev checks it against your preferences
              and travel times.
            </p>
            <form className="trip-form" onSubmit={submit}>
              <div
                className="mode-switch"
                role="group"
                aria-label="Planning mode"
              >
                <button
                  disabled={checking}
                  type="button"
                  aria-pressed={mode === "fixture"}
                  className={mode === "fixture" ? "selected" : ""}
                  onClick={() => chooseMode("fixture")}
                >
                  Replay demo
                </button>
                <button
                  disabled={checking}
                  type="button"
                  aria-pressed={mode === "live"}
                  className={mode === "live" ? "selected" : ""}
                  onClick={() => chooseMode("live")}
                >
                  Live planning
                </button>
              </div>
              {showCoverage && (
                <div className="notice-box" role="status">
                  <span className="notice-icon">
                    <Info size={18} />
                  </span>
                  <div>
                    <strong>US destinations</strong>
                    <p>
                      Live planning covers US cities, using Geoapify places and routes.
                    </p>
                  </div>
                  <button
                    type="button"
                    className="icon-button icon-button-small"
                    aria-label="Dismiss coverage notice"
                    onClick={() => {
                      setShowCoverage(false);
                      setCoverageDismissed(true);
                    }}
                  >
                    <X size={16} />
                  </button>
                </div>
              )}
              {error && !started && (
                <div className="notice-box notice-warning" role="alert">
                  <span className="notice-icon">
                    <WarningCircle size={18} />
                  </span>
                  <div>
                    <strong>This request needs a narrower scope</strong>
                    <p>{error}</p>
                  </div>
                </div>
              )}
              <div className="form-row">
                <label className="field">
                  <span>Starting place</span>
                  <input
                    value={form.origin}
                    onChange={(e) =>
                      setForm({ ...form, origin: e.target.value })
                    }
                    required
                    disabled={mode === "fixture" || checking}
                    placeholder="Hotel, station, or address"
                  />
                </label>
                <label className="field">
                  <span>Destination / area</span>
                  <input
                    value={form.destination}
                    onChange={(e) =>
                      setForm({ ...form, destination: e.target.value })
                    }
                    required
                    disabled={mode === "fixture" || checking}
                  />
                </label>
              </div>
              {form.days.map((day, dayIndex) => (
                <div key={dayIndex} className="multi-day-row">
                  {form.days.length > 1 && (
                    <div className="day-header">
                      <strong>Day {dayIndex + 1}</strong>
                      {form.days.length > 1 && (
                        <button
                          type="button"
                          className="icon-button icon-button-small"
                          aria-label={`Remove day ${dayIndex + 1}`}
                          onClick={() => {
                            const newDays = form.days.filter((_, i) => i !== dayIndex);
                            setForm({ ...form, days: newDays });
                          }}
                          disabled={checking}
                        >
                          <X size={16} />
                        </button>
                      )}
                    </div>
                  )}
                  <div className="form-row">
                    <label className="field">
                      <span>{form.days.length === 1 ? 'Date' : `Date (Day ${dayIndex + 1})`}</span>
                      <input
                        type="date"
                        value={day.date}
                        onChange={(e) => {
                          const newDays = [...form.days];
                          newDays[dayIndex] = { ...newDays[dayIndex], date: e.target.value };
                          setForm({ ...form, days: newDays });
                        }}
                        required
                        disabled={checking}
                      />
                    </label>
                    <label className="field">
                      <span>From</span>
                      <input
                        type="time"
                        value={day.startTime}
                        onChange={(e) => {
                          const newDays = [...form.days];
                          newDays[dayIndex] = { ...newDays[dayIndex], startTime: e.target.value };
                          setForm({ ...form, days: newDays });
                        }}
                        required
                        disabled={checking}
                      />
                    </label>
                    <label className="field">
                      <span>Until</span>
                      <input
                        type="time"
                        value={day.endTime}
                        onChange={(e) => {
                          const newDays = [...form.days];
                          newDays[dayIndex] = { ...newDays[dayIndex], endTime: e.target.value };
                          setForm({ ...form, days: newDays });
                        }}
                        required
                        disabled={checking}
                      />
                    </label>
                    {dayIndex === 0 && (
                      <label className="field">
                        <span>Travelers</span>
                        <input
                          type="number"
                          min="1"
                          max="20"
                          value={form.partySize}
                          onChange={(e) =>
                            setForm({ ...form, partySize: Number(e.target.value) })
                          }
                          required
                          disabled={checking}
                        />
                      </label>
                    )}
                  </div>
                </div>
              ))}
              {form.days.length < 7 && (
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => {
                    const lastDay = form.days[form.days.length - 1];
                    const nextDate = new Date(lastDay.date);
                    nextDate.setDate(nextDate.getDate() + 1);
                    const newDay = {
                      date: nextDate.toISOString().split('T')[0],
                      startTime: lastDay.startTime,
                      endTime: lastDay.endTime,
                    };
                    setForm({ ...form, days: [...form.days, newDay] });
                  }}
                  disabled={checking}
                >
                  <Plus size={18} />
                  Add Day {form.days.length + 1}
                </button>
              )}
              <label className="field">
                <span>Preferences</span>
                <textarea
                  rows={4}
                  value={form.preference}
                  onChange={(e) =>
                    setForm({ ...form, preference: e.target.value })
                  }
                  required
                  disabled={mode === "fixture" || checking}
                />
              </label>
              <label className="field">
                <span>Constraints</span>
                <textarea
                  rows={2}
                  value={form.constraints}
                  onChange={(e) =>
                    setForm({ ...form, constraints: e.target.value })
                  }
                  disabled={mode === "fixture" || checking}
                  placeholder="Accessibility, dietary, budget, or mobility constraints"
                />
              </label>
              {checking && (
                <div className="status-line" role="status">
                  <i className="spinner" />
                  <div>
                    <strong>Checking your request</strong>
                    <span>
                      Jev is confirming it covers one day, one city and no
                      bookings.
                    </span>
                  </div>
                </div>
              )}
              <button className="primary" disabled={checking}>
                <span>
                  {checking
                    ? "Checking request"
                    : mode === "fixture"
                      ? "Start replay"
                      : "Plan this day"}
                </span>
                <span className="go">
                  <ArrowRight size={20} weight="bold" />
                </span>
              </button>
            </form>
          </div>
          <div className="landing-dial">
            <DayDial start={windowStart} end={windowEnd} />
          </div>
        </section>
      ) : (
        <section className="workspace">
          <div className="plan-header">
            <button
              className="back"
              onClick={() => {
                abort.current?.abort();
                ++run.current;
                setLoading(false);
                setStarted(false);
              }}
            >
              <span className="icon-button icon-button-small">
                <ArrowLeft size={16} weight="bold" />
              </span>
              New trip
            </button>
            <h1>{form.destination}</h1>
            <div
              className={`mode-chip ${mode === "live" ? "mode-chip-live" : ""}`}
            >
              {mode === "live"
                ? "Live models and Geoapify data"
                : "Replay with simulated LLM and Jev"}
            </div>
          </div>

          <div className="triptych" aria-live="polite">
            <article className="mind">
              <span className="mind-icon">
                <ChatCircleText size={24} />
              </span>
              <h2>Planner</h2>
              <p className="mind-role">LLM</p>
              <p>
                {!loading && cursor === null
                  ? "Planning finished. Review the draft and its repair history."
                  : (lastLLM?.message ?? "Waiting for candidate places.")}
              </p>
            </article>
            <div className="map-wrap">
              <div className="map-panel">
                <LeafletMap points={points} isDarkTheme={isDarkTheme} />
              </div>
              <p className="map-note">
                {mode === "live"
                  ? "Live data from Geoapify and OpenStreetMap. Pan, zoom, and click any marker."
                  : "Sample fixture stops. Pan, zoom, and click any marker."}
              </p>
              <div className="run-status">
                {loading ? (
                  <>
                    <i className="spinner" />
                    <span>Planning in progress</span>
                    <button
                      className="pill-button"
                      onClick={() => abort.current?.abort()}
                    >
                      <Stop size={16} weight="fill" />
                      Stop
                    </button>
                  </>
                ) : (
                  <>
                    <CheckCircle size={20} weight="fill" />
                    <span>Run complete</span>
                  </>
                )}
                <span className="run-meta">
                  {shown.at(-1)?.elapsedMs ?? 0} ms, version{" "}
                  {displayed?.version ?? 0}
                </span>
              </div>
            </div>
            <article className="mind">
              <span className="mind-icon">
                <SealCheck size={24} />
              </span>
              <h2>Reviewer</h2>
              <p className="mind-role">Jev</p>
              <p>{lastJev?.message ?? "Waiting to screen candidates."}</p>
            </article>
          </div>

          {error && (
            <p className="error" role="alert">
              <WarningCircle size={20} />
              {error}
            </p>
          )}

          <div className="stat-row">
            <Stat label="Stops" value={activities.length} />
            <Stat label="Jev reviews" value={reviews.length} />
            <Stat label="Repair rounds" value={repairs.length} />
            <Stat
              label="ms per review"
              value={
                averageReview === null
                  ? "n/a"
                  : averageReview.toFixed(averageReview < 10 ? 1 : 0)
              }
            />
          </div>

          <TimingTrace events={shown} fixture={mode === "fixture"} />

          {events.length > 0 && !loading && (
            <div className="replay">
              <button
                className="play"
                aria-label={replaying ? "Pause replay" : "Replay from start"}
                onClick={() =>
                  replaying ? setReplaying(false) : startReplay()
                }
              >
                {replaying ? (
                  <Pause size={22} weight="fill" />
                ) : (
                  <Play size={22} weight="fill" />
                )}
              </button>
              <label className="replay-range">
                <span>
                  {cursor === null
                    ? "Final state"
                    : `Event ${cursor + 1} of ${events.length}`}
                </span>
                <input
                  aria-label="Replay progress"
                  type="range"
                  min={0}
                  max={events.length - 1}
                  value={cursor ?? events.length - 1}
                  onChange={(e) => {
                    setReplaying(false);
                    setCursor(Number(e.target.value));
                  }}
                />
              </label>
              <button
                className="pill-button"
                onClick={() => {
                  setReplaying(false);
                  setCursor(null);
                }}
              >
                Show final state
              </button>
              <button className="pill-button" onClick={exportRun}>
                <DownloadSimple size={16} />
                Export run
              </button>
              <button
                className="pill-button"
                disabled={
                  !displayed ||
                  displayed.issues.some((i) => i.status === "flag")
                }
                onClick={() =>
                  displayed && setAccepted(structuredClone(displayed))
                }
              >
                <FloppyDisk size={16} />
                Save draft
              </button>
              {accepted && (
                <span className="replay-saved">
                  Saved version {accepted.version} in this tab
                </span>
              )}
            </div>
          )}

          <div className="lower-grid">
            <section className="panel">
              <div className="panel-heading">
                <h2>Itinerary</h2>
                <span className="chip">Version {displayed?.version ?? 0}</span>
              </div>
              <div className="itinerary-dial">
                <DayDial
                  start={windowStart}
                  end={windowEnd}
                  stops={dialStops}
                />
              </div>
              <p className="notice">
                {(() => {
                  const completeEvent = shown.find(
                    (e) => e.type === "complete",
                  );
                  if (completeEvent)
                    return completeEvent.message.replace(
                      "Planning complete. ",
                      "",
                    );
                  return `Draft. Visit durations are estimates. Opening hours${
                    displayed?.origin &&
                    displayed?.firstLeg?.selected &&
                    displayed?.returnLeg?.selected
                      ? ""
                      : ", travel to the first stop and from the last stop,"
                  } and time zones are not verified.`;
                })()}
              </p>
              {displayed?.issues
                .filter((issue) => !issue.subjectIds.length)
                .map((issue) => (
                  <p className="issue" key={issue.checkId}>
                    <WarningCircle size={18} />
                    {issue.message}
                  </p>
                ))}
              <div className="timeline">
                {displayed?.origin && displayed?.firstLeg && (
                  <article className="activity" key="origin">
                    <time>{form.days[0].startTime}</time>
                    <div className="timeline-node">
                      <span>⌂</span>
                    </div>
                    <div className="activity-body">
                      <h3>{displayed.origin.formattedAddress}</h3>
                      <p className="stay">Starting point</p>
                      {displayed.firstLeg.selected && activities.length > 0 && (
                        <p className="travel">
                          {displayed.firstLeg.selected.mode === "transit" ? (
                            <Train size={18} />
                          ) : (
                            <PersonSimpleWalk size={18} />
                          )}
                          {/* Phase 1.3: clean transit label, no "Demo Metro Line" */}
                          {formatTransitLabel(displayed.firstLeg.selected, displayed.firstLeg.selected.durationMinutes)}
                        </p>
                      )}
                    </div>
                  </article>
                )}
                {activities.map((a, i) => {
                  const place = candidates.find((p) => p.id === a.placeId);
                  const offset = schedule[i];
                  // Phase 1.1: show both arrive and depart times
                  const arriveTime =
                    offset === null || offset === undefined
                      ? "TBD"
                      : formatTime(form.days[0].startTime, offset);
                  const departTime =
                    offset === null || offset === undefined
                      ? null
                      : formatTime(form.days[0].startTime, offset + a.durationMinutes);
                  const issues =
                    displayed?.issues.filter((issue) =>
                      issue.subjectIds.includes(a.id),
                    ) ?? [];
                  // Phase 1.3: first leg uses firstLeg, later legs use transportLegs
                  const transport = i === 0
                    ? displayed?.firstLeg?.selected
                    : displayed?.transportLegs?.[i - 1]?.selected;
                  const transitMinutes = i === 0
                    ? displayed?.firstLeg?.selected?.durationMinutes ?? null
                    : displayed?.routes[i - 1];

                  // Phase 1.2: 3-state Open/Closed/Unverified badge
                  const openStatus = getOpenStatus(place, displayed?.issues ?? [], a.id);

                  // Phase 1.3: clean transit label (no "Demo Metro Line")
                  const transitLabel = formatTransitLabel(transport, transitMinutes);

                  return (
                    <article className="activity" key={a.id}>
                      <time className="arrive-time">{arriveTime}</time>
                      <div className="timeline-node">
                        <span>{i + 1}</span>
                      </div>
                      <div
                        className={`activity-body ${issues.some((issue) => issue.status === "flag") ? "flagged" : ""}`}
                      >
                        {/* Phase 1.3: show transit for every leg including first */}
                        {transitLabel && (
                          <p className="travel">
                            {transport?.mode === "transit" ? (
                              <Train size={18} />
                            ) : (
                              <PersonSimpleWalk size={18} />
                            )}
                            {transitLabel}
                          </p>
                        )}
                        <h3>{place?.name ?? a.placeId}</h3>
                        <div className="stop-times">
                          <span className="time-label">Arrive {arriveTime}</span>
                          {departTime && <span className="time-sep">·</span>}
                          {departTime && <span className="time-label">Depart {departTime}</span>}
                          <span className="time-sep">·</span>
                          <span className="time-label">{a.durationMinutes} min</span>
                        </div>
                        <p className="reason">{a.reason}</p>
                        {/* Phase 1.2: 3-state status badge */}
                        {place && (
                          <div className="verification-badges">
                            <OpenStatusBadge status={openStatus} lastVerified={place.lastVerified} />
                            {place.accessibilityInfo?.wheelchairAccessible && (
                              <span
                                className="badge badge-info"
                                title="Wheelchair accessible"
                              >
                                ♿ Accessible
                              </span>
                            )}
                          </div>
                        )}
                        {place && place.source !== "demo" && (
                          <a
                            className="source-link"
                            href={placeUrl(place)}
                            target="_blank"
                            rel="noreferrer"
                          >
                            View on OpenStreetMap
                            <ArrowUpRight size={14} />
                          </a>
                        )}
                        {place?.types.length ? (
                          <div className="tags">
                            {place.types.map((t) => (
                              <span key={t}>{t}</span>
                            ))}
                          </div>
                        ) : null}
                        {issues.map((issue) => (
                          <p
                            className="issue"
                            key={
                              issue.checkId +
                              issue.subjectIds.join(",") +
                              issue.message
                            }
                          >
                            <WarningCircle size={18} />
                            {issue.message}
                          </p>
                        ))}
                      </div>
                    </article>
                  );
                })}
                {displayed?.origin &&
                  displayed?.returnLeg &&
                  activities.length > 0 && (
                    <article className="activity" key="return">
                      <time>
                        {schedule[activities.length - 1] !== null
                          ? formatTime(
                              form.days[0].startTime,
                              schedule[activities.length - 1]! +
                                activities[activities.length - 1]
                                  .durationMinutes +
                                (displayed.returnLeg.selected
                                  ?.durationMinutes ?? 0),
                            )
                          : "TBD"}
                      </time>
                      <div className="timeline-node">
                        <span>⌂</span>
                      </div>
                      <div className="activity-body">
                        {displayed.returnLeg.selected && (
                          <p className="travel">
                            {displayed.returnLeg.selected.mode === "transit" ? (
                              <Train size={18} />
                            ) : (
                              <PersonSimpleWalk size={18} />
                            )}
                            {/* Phase 1.3: clean transit label */}
                            {formatTransitLabel(displayed.returnLeg.selected, displayed.returnLeg.selected.durationMinutes)}
                          </p>
                        )}
                        <h3>{displayed.origin.formattedAddress}</h3>
                        <p className="stay">Return to starting point</p>
                      </div>
                    </article>
                  )}
                {!activities.length && (
                  <p className="empty">
                    Stops will appear here as Jev screens candidates.
                  </p>
                )}
              </div>
              {/* Phase 1.6: Unused time notice */}
              {!loading && activities.length > 0 && lastActivityEnd !== null && windowStart !== null && windowEnd !== null && (() => {
                const endWindowOffset = windowEnd - windowStart;
                const unusedMinutes = endWindowOffset - lastActivityEnd;
                if (unusedMinutes < 30) return null;
                const endsAtTime = formatTime(form.days[0].startTime, lastActivityEnd);
                const windowEndTime = form.days[0].endTime;
                return (
                  <div className="notice-box ends-early-notice" role="status">
                    <span className="notice-icon"><Info size={18} /></span>
                    <div>
                      <strong>Ends early at {endsAtTime}</strong>
                      <p>Your window runs until {windowEndTime} — {unusedMinutes} min unused. You could add another stop or shorten your day.</p>
                    </div>
                  </div>
                );
              })()}
            </section>

            {/* Task 4.23-4.28: Multi-day accordion — shown when multiple day segments exist */}
            {multiDaySegments.length > 1 && (
              <section className="panel">
                <div className="panel-heading">
                  <h2>Multi-day itinerary</h2>
                  <span className="chip">{multiDaySegments.length} days</span>
                </div>
                <DayAccordion
                  segments={multiDaySegments}
                  startTimes={multiDaySegments.map((seg, i) => form.days[i]?.startTime ?? form.days[0].startTime)}
                  endTimes={multiDaySegments.map((seg, i) => form.days[i]?.endTime ?? form.days[0].endTime)}
                  activeDay={activeDay}
                  onDayChange={setActiveDay}
                  candidateName={(placeId) =>
                    candidates.find((p) => p.id === placeId)?.name ?? placeId
                  }
                />
              </section>
            )}

            <section className="panel">
              <div className="panel-heading">
                <h2>Planning log</h2>
                <span className="chip">
                  {shown.length} {shown.length === 1 ? "event" : "events"}
                </span>
              </div>
              <div className="decision-list">
                {shown.map((e) => (
                  <details
                    className="event"
                    key={e.sequence}
                    open={
                      e.type === "repair_diff" || e.type === "jev_query_end"
                    }
                  >
                    <summary>
                      <span className={`actor actor-${e.actor.toLowerCase()}`}>
                        {e.actor}
                      </span>
                      <b>{e.message}</b>
                      <small>
                        {e.elapsedMs} ms
                        {e.version !== undefined
                          ? `, version ${e.version}`
                          : ""}
                        {e.latencyMs !== undefined
                          ? `, call ${e.latencyMs} ms`
                          : ""}
                      </small>
                    </summary>
                    {e.context && (
                      <div className="event-detail">
                        <p>
                          Controller timing, version {e.context.version}:{" "}
                          {e.context.timing.usedMinutes ?? "unknown"} min used
                          of {e.context.timing.availableMinutes} min available.
                        </p>
                        {e.context.candidateRoutes.map((r) => (
                          <p key={r.placeId}>
                            {name(r.placeId)}:{" "}
                            {r.options
                              ?.map((option) =>
                                option.mode === "walk"
                                  ? `walk ${option.durationMinutes} min`
                                  : `transit ${option.durationMinutes} min (${option.walkingMinutes} min access walk)`,
                              )
                              .join(" / ") || "route unknown"}
                          </p>
                        ))}
                      </div>
                    )}
                    {e.transportSelection && (
                      <div className="event-detail">
                        <p>
                          Transport decision:{" "}
                          {e.transportSelection.selectedOptionId}
                        </p>
                        <pre>
                          {JSON.stringify(
                            e.transportSelection.answers,
                            null,
                            2,
                          )}
                        </pre>
                      </div>
                    )}
                    {e.decisions && (
                      <div className="event-detail">
                        {e.decisions.map((decision) => (
                          <p key={decision.queryId + decision.subjectId}>
                            <strong>{name(decision.subjectId)}</strong>:{" "}
                            {decision.dimension}, {decision.choice}, confidence{" "}
                            {Math.round(decision.confidence * 100)}%
                          </p>
                        ))}
                      </div>
                    )}
                    {e.model && <p className="notice">Model: {e.model}</p>}
                    {e.review && (
                      <div className="event-detail">
                        <p>
                          {e.review.model}, {e.review.scope} review,{" "}
                          {e.review.status}
                        </p>
                        {e.review.issues.map((issue, i) => (
                          <div key={i}>
                            <p>{issue.message}</p>
                            <p>Condition: {issue.condition}</p>
                            <p>Repair direction: {issue.repairHint}</p>
                            {issue.evidence?.map((fact, index) => (
                              <p key={index}>{fact}</p>
                            ))}
                          </div>
                        ))}
                        {e.review.answers && (
                          <pre>{JSON.stringify(e.review.answers, null, 2)}</pre>
                        )}
                      </div>
                    )}
                    {e.before && e.after && (
                      <div className="event-detail">
                        {e.before.map((a) => {
                          const next = e.after!.find((n) => n.id === a.id);
                          return JSON.stringify(a) ===
                            JSON.stringify(next) ? null : (
                            <p key={a.id}>
                              <del>
                                {name(a.placeId)}, {a.durationMinutes} min
                              </del>
                              <br />
                              <strong>
                                Now:{" "}
                                {next
                                  ? `${name(next.placeId)}, ${next.durationMinutes} min`
                                  : "Removed"}
                              </strong>
                            </p>
                          );
                        })}
                      </div>
                    )}
                  </details>
                ))}
                {!shown.length && (
                  <p className="empty">
                    The log fills in as the planner and Jev work.
                  </p>
                )}
              </div>
            </section>
          </div>
        </section>
      )}
    </main>
  );
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="stat-ring">
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  );
}

function FixturePlot({
  points,
  positions,
}: {
  points: Place[];
  positions: { x: number; y: number }[];
}) {
  return (
    <div className="plot">
      <span className="plot-ring plot-ring-mid" />
      <span className="plot-ring plot-ring-inner" />
      {points.length > 1 && (
        <svg
          className="plot-route"
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          <path
            d={positions
              .map((p, i) => `${i ? "L" : "M"}${p.x} ${p.y}`)
              .join(" ")}
          />
        </svg>
      )}
      {points.map((p, i) => (
        <a
          className={`plot-pin ${positions[i].x > 50 ? "plot-pin-flip" : ""}`}
          style={{ left: `${positions[i].x}%`, top: `${positions[i].y}%` }}
          key={p.id}
          href={placeUrl(p)}
          target="_blank"
          rel="noreferrer"
          title={p.name}
        >
          <span>{i + 1}</span>
          <b>{p.name}</b>
        </a>
      ))}
      {!points.length && (
        <p className="plot-empty">Waiting for the first stop</p>
      )}
    </div>
  );
}

function plotPositions(points: Place[]) {
  if (!points.length) return [];
  const lons = points.map((p) => p.longitude),
    lats = points.map((p) => p.latitude);
  const minLon = Math.min(...lons),
    maxLon = Math.max(...lons),
    minLat = Math.min(...lats),
    maxLat = Math.max(...lats);
  const unit = (value: number, min: number, max: number) =>
    max === min ? 0.5 : (value - min) / (max - min);
  return points.map((p) => ({
    x: 22 + unit(p.longitude, minLon, maxLon) * 56,
    y: 22 + (1 - unit(p.latitude, minLat, maxLat)) * 56,
  }));
}


function placeUrl(place: Place) {
  if (place.source === "geoapify")
    return `https://www.openstreetmap.org/?mlat=${place.latitude}&mlon=${place.longitude}#map=18/${place.latitude}/${place.longitude}`;
  const [, type, id] = place.id.split(":");
  return `https://www.openstreetmap.org/${({ N: "node", W: "way", R: "relation" } as Record<string, string>)[type] ?? "node"}/${id}`;
}

function TimingTrace({
  events,
  fixture,
}: {
  events: RunEvent[];
  fixture: boolean;
}) {
  const calls = events.filter(
    (e) =>
      (e.type === "proposal" || e.type === "review_end") &&
      e.latencyMs !== undefined,
  );
  if (!calls.length) return null;
  const origin = Math.min(...calls.map((e) => e.elapsedMs - e.latencyMs!));
  const span = Math.max(1, (events.at(-1)?.elapsedMs ?? 0) - origin);
  return (
    <section className="timing-trace" aria-label="Model call timeline">
      <div className="trace-heading">
        <h2>Model call timing</h2>
        <span>
          {fixture
            ? "Local simulation, not a model benchmark."
            : "Measured for this request. Overlapping bars ran in parallel."}
        </span>
      </div>
      {(["LLM", "Jev"] as const).map((actor) => (
        <div className="trace-row" key={actor}>
          <b>{actor}</b>
          <div className="trace-track">
            {calls
              .filter((e) => e.actor === actor)
              .map((e) => (
                <span
                  key={e.sequence}
                  className={`trace-call trace-${actor.toLowerCase()}`}
                  style={{
                    left: `${((e.elapsedMs - e.latencyMs! - origin) / span) * 100}%`,
                    width: `${Math.max(0.6, (e.latencyMs! / span) * 100)}%`,
                  }}
                  title={`${actor}, version ${e.version}, ${e.latencyMs} ms${e.review ? `, ${e.review.scope} review` : ""}`}
                />
              ))}
          </div>
        </div>
      ))}
      <div className="trace-scale">
        <span>0 s</span>
        <span>{(span / 1000).toFixed(1)} s</span>
      </div>
    </section>
  );
}

// ─── Phase 1.2: 3-state Open/Closed/Unverified badge ─────────────────────────

type OpenStatus = 'open' | 'closed' | 'temporarily_closed' | 'unverified';

function getOpenStatus(
  place: Place | undefined,
  issues: { checkId: string; subjectIds: string[]; status: string }[],
  activityId: string,
): OpenStatus {
  if (!place) return 'unverified';

  // Permanently or temporarily closed — deterministic from data
  if (place.operationalStatus === 'permanently_closed') return 'closed';
  if (place.operationalStatus === 'temporarily_closed') return 'temporarily_closed';

  // Check if Jev flagged opening hours for this activity
  const hoursFlagged = issues.some(
    (i) => i.checkId === 'opening_hours_fit' && i.status === 'flag' && i.subjectIds.includes(activityId),
  );
  if (hoursFlagged) return 'closed';

  // "Open" may only appear when hours were actually verified
  if (place.formattedOpeningHours && place.operationalStatus === 'operational') return 'open';

  return 'unverified';
}

function OpenStatusBadge({
  status,
  lastVerified,
}: {
  status: OpenStatus;
  lastVerified?: string;
}) {
  const verifiedDate = lastVerified
    ? ` as of ${new Date(lastVerified).toLocaleDateString()}`
    : '';

  if (status === 'open') {
    return (
      <span
        className="badge badge-verified status-badge"
        title={`Hours verified${verifiedDate}. Likely open during scheduled visit.`}
        aria-label="Open — hours verified"
      >
        ✓ Open
      </span>
    );
  }
  if (status === 'closed') {
    return (
      <span
        className="badge badge-error status-badge"
        title="Confirmed closed during scheduled visit."
        aria-label="Closed — confirmed"
      >
        ✗ Closed
      </span>
    );
  }
  if (status === 'temporarily_closed') {
    return (
      <span
        className="badge badge-warning status-badge"
        title="Place is temporarily closed — verify before visiting."
        aria-label="Temporarily closed"
      >
        ⚠ Temp. closed
      </span>
    );
  }
  // unverified
  return (
    <span
      className="badge badge-info status-badge"
      title="Opening hours not verified. Check before visiting."
      aria-label="Hours not verified"
    >
      ? Unverified
    </span>
  );
}

// ─── Phase 1.3: Clean transit label (no "Demo Metro Line") ───────────────────

function formatTransitLabel(
  transport: { mode: string; durationMinutes: number; walkingMinutes?: number; transfers?: number; lines?: string[] } | null | undefined,
  transitMinutes: number | null | undefined,
): string | null {
  if (!transport) {
    if (transitMinutes == null) return null;
    return `Walk ${transitMinutes} min (estimated)`;
  }
  if (transport.mode === 'walk') {
    return `Walk ${transport.durationMinutes} min`;
  }
  // Transit: show duration + walking access, but no line names (they may be demo/fake)
  let label = `Transit ${transport.durationMinutes} min`;
  if (transport.walkingMinutes) label += `, ${transport.walkingMinutes} min on foot`;
  if (transport.transfers) label += `, ${transport.transfers} change${transport.transfers > 1 ? 's' : ''}`;
  return label;
}
