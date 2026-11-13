"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
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
  SealCheck,
  Stop,
  Train,
  WarningCircle,
  X,
} from "@phosphor-icons/react";
import type { Activity, Place, RunEvent, Snapshot } from "@/lib/domain";
import { AmapMap } from "@/app/components/AmapMap";
import { DayDial, type DialStop } from "@/app/components/DayDial";

const defaults = {
  origin: "Penn Station, New York City",
  destination: "New York City",
  date: "2026-10-12",
  startTime: "09:00",
  endTime: "19:00",
  partySize: 1,
  preference:
    "I enjoy art, local neighborhoods and food. Include one art museum, but avoid repetitive museum visits. Keep the day relaxed.",
  constraints:
    "Avoid long cross-city transfers and keep at least one relaxed break.",
};
const liveDefaults = { ...defaults, destination: "New York City" };

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
  const windowStart = toMinutes(form.startTime);
  const windowEnd = toMinutes(form.endTime);
  const schedule = buildSchedule(activities, displayed?.routes ?? []);
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
      const response = await fetch("/api/plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          origin: form.origin,
          destination: form.destination,
          partySize: form.partySize,
          preference: form.preference,
          constraints: form.constraints,
          startAt: `${form.date}T${form.startTime}:00`,
          endAt: `${form.date}T${form.endTime}:00`,
          mode,
        }),
      });
      if (!response.ok)
        throw new Error((await response.json()).error ?? "Planning failed");
      const reader = response.body!.getReader(),
        decoder = new TextDecoder();
      let buffer = "";
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop()!;
        for (const line of lines) {
          if (!line || generation !== run.current) continue;
          const update = JSON.parse(line) as RunEvent;
          if (update.type === "error") throw new Error(update.message);
          setEvents((previous) => [...previous, update]);
          if (update.candidates) {
            receivedCandidates = true;
            setCandidates(update.candidates);
          }
          if (update.snapshot) setSnapshot(update.snapshot);
        }
      }
    } catch (caught) {
      if (generation === run.current) {
        if (!receivedCandidates && !controller.signal.aborted)
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
    setForm(next === "live" ? liveDefaults : defaults);
    setError("");
    setShowCoverage(next === "live" && !coverageDismissed);
  }

  return (
    <main>
      <header className="site-nav">
        <div className="brand">
          <span className="brand-mark">D</span>Daymark
        </div>
        <a
          className="icon-button"
          href="https://github.com/dev-mskhan/daymark"
          target="_blank"
          rel="noreferrer"
          aria-label="View Daymark on GitHub"
        >
          <GithubLogo size={22} weight="regular" />
        </a>
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
                    <strong>Mainland China only</strong>
                    <p>
                      Live planning covers destinations across mainland China.
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
              <div className="form-row">
                <label className="field">
                  <span>Date</span>
                  <input
                    type="date"
                    value={form.date}
                    onChange={(e) => setForm({ ...form, date: e.target.value })}
                    required
                    disabled={checking}
                  />
                </label>
                <label className="field">
                  <span>From</span>
                  <input
                    type="time"
                    value={form.startTime}
                    onChange={(e) =>
                      setForm({ ...form, startTime: e.target.value })
                    }
                    required
                    disabled={checking}
                  />
                </label>
                <label className="field">
                  <span>Until</span>
                  <input
                    type="time"
                    value={form.endTime}
                    onChange={(e) =>
                      setForm({ ...form, endTime: e.target.value })
                    }
                    required
                    disabled={checking}
                  />
                </label>
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
              </div>
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
                ? "Live models and Amap data"
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
              <div className="map-ring">
                <div className="map-stage">
                  {mode === "live" ? (
                    <AmapMap points={points} />
                  ) : (
                    <FixturePlot points={points} positions={positions} />
                  )}
                </div>
              </div>
              <p className="map-note">
                {mode === "live"
                  ? "Map data from Amap. The dashed line shows stop order, not the route."
                  : "Sample data. Positions are schematic and the dashed line is not a route."}
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
                Draft. Visit durations are estimates. Opening hours
                {displayed?.origin &&
                displayed?.firstLeg?.selected &&
                displayed?.returnLeg?.selected
                  ? ""
                  : ", travel to the first stop and from the last stop,"}{" "}
                and time zones are not verified.
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
                    <time>{form.startTime}</time>
                    <div className="timeline-node">
                      <span>⌂</span>
                    </div>
                    <div className="activity-body">
                      <h3>{displayed.origin.formattedAddress}</h3>
                      <p className="stay">Starting point</p>
                      {displayed.firstLeg.selected && activities.length > 0 && (
                        <>
                          <p className="travel">
                            {displayed.firstLeg.selected.mode === "transit" ? (
                              <Train size={18} />
                            ) : (
                              <PersonSimpleWalk size={18} />
                            )}
                            {displayed.firstLeg.selected.mode === "transit"
                              ? `Transit ${displayed.firstLeg.selected.durationMinutes} min, ${displayed.firstLeg.selected.walkingMinutes} min on foot${displayed.firstLeg.selected.transfers ? `, ${displayed.firstLeg.selected.transfers} transfer${displayed.firstLeg.selected.transfers > 1 ? "s" : ""}` : ""}`
                              : `Walk ${displayed.firstLeg.selected.durationMinutes} min`}
                          </p>
                          {displayed.firstLeg.selected.lines.length ? (
                            <p className="travel-lines">
                              {displayed.firstLeg.selected.lines.join(
                                ", then ",
                              )}
                            </p>
                          ) : null}
                        </>
                      )}
                    </div>
                  </article>
                )}
                {activities.map((a, i) => {
                  const place = candidates.find((p) => p.id === a.placeId);
                  const offset = schedule[i];
                  const start =
                    offset === null || offset === undefined
                      ? "TBD"
                      : formatTime(form.startTime, offset);
                  const issues =
                    displayed?.issues.filter((issue) =>
                      issue.subjectIds.includes(a.id),
                    ) ?? [];
                  const transport = displayed?.transportLegs?.[i - 1]?.selected;
                  const walkMinutes = displayed?.routes[i - 1];
                  return (
                    <article className="activity" key={a.id}>
                      <time>{start}</time>
                      <div className="timeline-node">
                        <span>{i + 1}</span>
                      </div>
                      <div
                        className={`activity-body ${issues.some((issue) => issue.status === "flag") ? "flagged" : ""}`}
                      >
                        {i > 0 && (
                          <p className="travel">
                            {transport?.mode === "transit" ? (
                              <Train size={18} />
                            ) : (
                              <PersonSimpleWalk size={18} />
                            )}
                            {transport?.mode === "transit"
                              ? `Transit ${transport.durationMinutes} min, ${transport.walkingMinutes} min on foot${transport.transfers ? `, ${transport.transfers} transfer${transport.transfers > 1 ? "s" : ""}` : ""}`
                              : `Walk ${walkMinutes ?? "unknown"} min`}
                          </p>
                        )}
                        {transport?.lines.length ? (
                          <p className="travel-lines">
                            {transport.lines.join(", then ")}
                          </p>
                        ) : null}
                        <h3>{place?.name ?? a.placeId}</h3>
                        <p className="stay">
                          Stay about {a.durationMinutes} min
                        </p>
                        <p className="reason">{a.reason}</p>
                        {place && place.source !== "demo" && (
                          <a
                            className="source-link"
                            href={placeUrl(place)}
                            target="_blank"
                            rel="noreferrer"
                          >
                            {place.source === "amap"
                              ? "View on Amap"
                              : "View on OpenStreetMap"}
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
                              form.startTime,
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
                          <>
                            <p className="travel">
                              {displayed.returnLeg.selected.mode ===
                              "transit" ? (
                                <Train size={18} />
                              ) : (
                                <PersonSimpleWalk size={18} />
                              )}
                              {displayed.returnLeg.selected.mode === "transit"
                                ? `Transit ${displayed.returnLeg.selected.durationMinutes} min, ${displayed.returnLeg.selected.walkingMinutes} min on foot${displayed.returnLeg.selected.transfers ? `, ${displayed.returnLeg.selected.transfers} transfer${displayed.returnLeg.selected.transfers > 1 ? "s" : ""}` : ""}`
                                : `Walk ${displayed.returnLeg.selected.durationMinutes} min`}
                            </p>
                            {displayed.returnLeg.selected.lines.length ? (
                              <p className="travel-lines">
                                {displayed.returnLeg.selected.lines.join(
                                  ", then ",
                                )}
                              </p>
                            ) : null}
                          </>
                        )}
                        <h3>{displayed.origin.formattedAddress}</h3>
                        <p className="stay">Return to origin</p>
                      </div>
                    </article>
                  )}
                {!activities.length && (
                  <p className="empty">
                    Stops will appear here as Jev screens candidates.
                  </p>
                )}
              </div>
            </section>

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

function buildSchedule(activities: Activity[], routes: (number | null)[]) {
  const offsets: (number | null)[] = [];
  let elapsed: number | null = 0;
  for (let i = 0; i < activities.length; i++) {
    if (i > 0) {
      const transit = routes[i - 1];
      elapsed =
        elapsed === null || transit === null || transit === undefined
          ? null
          : elapsed + transit;
    }
    offsets.push(elapsed);
    if (elapsed !== null) elapsed += activities[i].durationMinutes;
  }
  return offsets;
}

function toMinutes(value: string) {
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  return match ? Number(match[1]) * 60 + Number(match[2]) : null;
}
function formatTime(start: string, offset: number) {
  const [h, m] = start.split(":").map(Number);
  const total = h * 60 + m + offset;
  return `${String(Math.floor(total / 60) % 24).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

function placeUrl(place: Place) {
  if (place.source === "amap")
    return `https://uri.amap.com/marker?position=${place.longitude},${place.latitude}&name=${encodeURIComponent(place.name)}`;
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
