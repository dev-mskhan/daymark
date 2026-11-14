"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api/client";

interface TripSummary {
  id: string;
  title: string;
  destination: string;
  status: "draft" | "planned" | "accepted" | "archived";
  updatedAt: string;
}

const today = () => new Date().toISOString().slice(0, 10);
const addDays = (date: string, n: number) =>
  new Date(Date.parse(`${date}T00:00:00Z`) + n * 86_400_000)
    .toISOString()
    .slice(0, 10);

export function TripsManager() {
  const [trips, setTrips] = useState<TripSummary[] | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [progress, setProgress] = useState<Record<string, string[]>>({});
  const [runs, setRuns] = useState<Record<string, string>>({});
  const [form, setForm] = useState({
    title: "",
    destination: "New York City",
    origin: "Penn Station, New York City",
    preference: "Art, local neighborhoods and food.",
    startDate: today(),
    days: 2,
    mode: "fixture" as "fixture" | "live",
  });

  const load = useCallback(async () => {
    try {
      const response = await apiFetch("/api/trips");
      setTrips((await response.json()).trips);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not load trips.");
    }
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  async function run(id: string, action: () => Promise<void>) {
    setBusy(id);
    setError("");
    try {
      await action();
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Something went wrong.");
    } finally {
      setBusy(null);
    }
  }

  const create = (event: FormEvent) => {
    event.preventDefault();
    return run("new", async () => {
      await apiFetch("/api/trips", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: form.title || `${form.destination} trip`,
          destination: form.destination,
          origin: form.origin || undefined,
          preference: form.preference,
          mode: form.mode,
          days: Array.from({ length: form.days }, (_, i) => ({
            dayNumber: i + 1,
            date: addDays(form.startDate, i),
            startTime: "09:00",
            endTime: "19:00",
          })),
        }),
      });
      setForm({ ...form, title: "" });
    });
  };

  const plan = (id: string) =>
    run(id, async () => {
      setProgress((p) => ({ ...p, [id]: [] }));
      const response = await apiFetch(`/api/trips/${id}/plan`, { method: "POST" });
      const reader = response.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop()!;
        for (const line of lines.filter(Boolean)) {
          const event = JSON.parse(line) as { type: string; message: string; runId?: string };
          if (event.type === "error") throw new Error(event.message);
          if (event.type === "saved" && event.runId) setRuns((r) => ({ ...r, [id]: event.runId! }));
          if (["day_start", "inter_day_route", "complete", "saved"].includes(event.type))
            setProgress((p) => ({ ...p, [id]: [...(p[id] ?? []), event.message] }));
        }
      }
    });

  const post = (id: string, path: string, body?: unknown) =>
    run(id, async () => {
      await apiFetch(`/api/trips/${id}${path}`, {
        method: "POST",
        ...(body ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : {}),
      });
    });

  const remove = (trip: TripSummary) => {
    if (!window.confirm(`Delete “${trip.title}” permanently?`)) return;
    return run(trip.id, async () => {
      await apiFetch(`/api/trips/${trip.id}?confirm=true`, { method: "DELETE" });
    });
  };

  return (
    <>
      <form className="panel trip-form" onSubmit={create}>
        <h2>New trip</h2>
        <label className="field">
          <span>Title</span>
          <input value={form.title} maxLength={120} placeholder="Optional" onChange={(e) => setForm({ ...form, title: e.target.value })} />
        </label>
        <div className="form-row">
          <label className="field">
            <span>Destination</span>
            <input required minLength={2} value={form.destination} onChange={(e) => setForm({ ...form, destination: e.target.value })} />
          </label>
          <label className="field">
            <span>Start date</span>
            <input type="date" required value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} />
          </label>
          <label className="field">
            <span>Days (1–7)</span>
            <input type="number" min={1} max={7} required value={form.days} onChange={(e) => setForm({ ...form, days: Math.min(7, Math.max(1, Number(e.target.value) || 1)) })} />
          </label>
        </div>
        <label className="field">
          <span>Starting place</span>
          <input value={form.origin} onChange={(e) => setForm({ ...form, origin: e.target.value })} />
        </label>
        <label className="field">
          <span>Preferences</span>
          <textarea required minLength={2} rows={3} value={form.preference} onChange={(e) => setForm({ ...form, preference: e.target.value })} />
        </label>
        <div className="mode-switch" role="group" aria-label="Planning mode">
          {(["fixture", "live"] as const).map((mode) => (
            <button key={mode} type="button" aria-pressed={form.mode === mode} className={form.mode === mode ? "selected" : ""} onClick={() => setForm({ ...form, mode })}>
              {mode === "fixture" ? "Replay demo" : "Live planning"}
            </button>
          ))}
        </div>
        <button className="primary" disabled={busy === "new"}>
          <span>{busy === "new" ? "Saving…" : "Save trip"}</span>
        </button>
      </form>

      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}

      {trips === null ? (
        <p className="empty">Loading trips…</p>
      ) : trips.length === 0 ? (
        <p className="empty">No saved trips yet. Create one above.</p>
      ) : (
        <ul className="trip-list">
          {trips.map((trip) => (
            <li key={trip.id} className="trip-row">
              <div>
                <strong>{trip.title}</strong>
                <p className="trip-meta">
                  {trip.destination} · {trip.status} · updated {new Date(trip.updatedAt).toLocaleDateString()}
                </p>
                {progress[trip.id]?.length ? (
                  <div className="trip-progress" aria-live="polite">
                    {progress[trip.id].map((line, i) => (
                      <div key={i}>{line}</div>
                    ))}
                  </div>
                ) : null}
              </div>
              <div className="trip-row-actions">
                <button className="pill-button" disabled={busy === trip.id} onClick={() => plan(trip.id)}>
                  {busy === trip.id ? "Working…" : "Plan"}
                </button>
                {runs[trip.id] && (
                  <button className="pill-button" disabled={busy === trip.id} onClick={() => post(trip.id, "/accept", { planningRunId: runs[trip.id] })}>
                    Save itinerary
                  </button>
                )}
                <a className="pill-button" href={`/api/trips/${trip.id}/export?format=markdown`}>
                  Export
                </a>
                <button className="pill-button" disabled={busy === trip.id} onClick={() => post(trip.id, "/duplicate")}>
                  Duplicate
                </button>
                <button className="pill-button" disabled={busy === trip.id} onClick={() => post(trip.id, "/archive")}>
                  Archive
                </button>
                <button className="pill-button" disabled={busy === trip.id} onClick={() => remove(trip)}>
                  Delete
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
