"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api/client";
import type { Place } from "@/lib/domain";

interface TripSummary {
  id: string;
  title: string;
  destination: string;
  status: "draft" | "planned" | "accepted" | "archived";
  updatedAt: string;
}

interface DayFormInput {
  startTime: string;
  endTime: string;
  overnightLocation: string;
  latitude: string;
  longitude: string;
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
  const [dayInputs, setDayInputs] = useState<DayFormInput[]>(() =>
    Array.from({ length: 7 }, () => ({
      startTime: "09:00",
      endTime: "19:00",
      overnightLocation: "",
      latitude: "",
      longitude: "",
    })),
  );
  const [form, setForm] = useState({
    title: "",
    destination: "New York City",
    origin: "Penn Station, New York City",
    preference: "Art, local neighborhoods and food.",
    startDate: today(),
    days: 2,
    mode: "fixture" as "fixture" | "live",
  });

  const updateDayInput = (index: number, patch: Partial<DayFormInput>) =>
    setDayInputs((current) =>
      current.map((input, i) => (i === index ? { ...input, ...patch } : input)),
    );

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
      const days = await Promise.all(
        Array.from({ length: form.days }, async (_, i) => {
          const input = dayInputs[i];
          const query = input.overnightLocation.trim();
          let overnightPlace: Place | undefined;

          if (query && form.mode === "live") {
            const response = await apiFetch("/api/places/geocode", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ query }),
            });
            ({ place: overnightPlace } = (await response.json()) as { place: Place });
          } else if (query) {
            const latitude = Number(input.latitude);
            const longitude = Number(input.longitude);
            if (
              input.latitude.trim() === "" ||
              input.longitude.trim() === "" ||
              !Number.isFinite(latitude) ||
              !Number.isFinite(longitude) ||
              latitude < -90 ||
              latitude > 90 ||
              longitude < -180 ||
              longitude > 180
            ) {
              throw new Error(`Enter valid coordinates for the overnight stop on day ${i + 1}.`);
            }
            overnightPlace = {
              id: `demo-overnight-${i + 1}`,
              name: query,
              address: query,
              latitude,
              longitude,
              types: [],
              source: "demo",
            };
          } else if (input.latitude.trim() !== "" || input.longitude.trim() !== "") {
            throw new Error(`Enter an overnight stop name for day ${i + 1}.`);
          }

          return {
            dayNumber: i + 1,
            date: addDays(form.startDate, i),
            startTime: input.startTime,
            endTime: input.endTime,
            ...(overnightPlace ? { overnightPlace } : {}),
          };
        }),
      );

      await apiFetch("/api/trips", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: form.title || `${form.destination} trip`,
          destination: form.destination,
          origin: form.origin || undefined,
          preference: form.preference,
          mode: form.mode,
          days,
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
        <div className="day-boundaries">
          {Array.from({ length: form.days }, (_, i) => {
            const day = dayInputs[i];
            return (
              <fieldset className="day-boundary" key={i}>
                <legend>
                  Day {i + 1} · {form.startDate ? addDays(form.startDate, i) : "Set a start date"}
                </legend>
                <div className="day-time-row">
                  <label className="field">
                    <span>Start time</span>
                    <input type="time" required value={day.startTime} onChange={(e) => updateDayInput(i, { startTime: e.target.value })} />
                  </label>
                  <label className="field">
                    <span>End time</span>
                    <input type="time" required value={day.endTime} onChange={(e) => updateDayInput(i, { endTime: e.target.value })} />
                  </label>
                </div>
                <label className="field">
                  <span>Overnight stop (optional)</span>
                  <input
                    maxLength={400}
                    placeholder="Hotel name or full address"
                    value={day.overnightLocation}
                    onChange={(e) => updateDayInput(i, { overnightLocation: e.target.value })}
                  />
                </label>
                {form.mode === "live" ? (
                  <p className="day-boundary-hint">Live mode resolves this location with Geoapify when you save.</p>
                ) : day.overnightLocation.trim() ? (
                  <>
                    <p className="day-boundary-hint">Fixture mode makes no provider calls. Enter the stop coordinates to use it.</p>
                    <div className="day-time-row">
                      <label className="field">
                        <span>Latitude</span>
                        <input type="number" min={-90} max={90} step="any" required value={day.latitude} onChange={(e) => updateDayInput(i, { latitude: e.target.value })} />
                      </label>
                      <label className="field">
                        <span>Longitude</span>
                        <input type="number" min={-180} max={180} step="any" required value={day.longitude} onChange={(e) => updateDayInput(i, { longitude: e.target.value })} />
                      </label>
                    </div>
                  </>
                ) : null}
              </fieldset>
            );
          })}
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
