"use client";

import { useEffect, useRef, useState } from "react";
import type { Place } from "@/lib/domain";

type AmapInstance = {
  destroy(): void;
  clearMap(): void;
  add(overlays: unknown[]): void;
  setFitView(
    overlays?: unknown[],
    immediately?: boolean,
    avoid?: number[],
  ): void;
};

type AmapApi = {
  Map: new (
    container: HTMLDivElement,
    options: Record<string, unknown>,
  ) => AmapInstance;
  Marker: new (options: Record<string, unknown>) => unknown;
  Polyline: new (options: Record<string, unknown>) => unknown;
  Pixel: new (x: number, y: number) => unknown;
};

declare global {
  interface Window {
    AMap?: AmapApi;
    _AMapSecurityConfig?: { serviceHost: string };
  }
}

let loader: Promise<AmapApi> | undefined;

function loadAmap(key: string): Promise<AmapApi> {
  if (window.AMap) return Promise.resolve(window.AMap);
  if (loader) return loader;
  window._AMapSecurityConfig = {
    serviceHost: `${window.location.origin}/_AMapService`,
  };
  loader = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = `https://webapi.amap.com/maps?v=2.0&key=${encodeURIComponent(key)}`;
    script.async = true;
    script.onload = () =>
      window.AMap
        ? resolve(window.AMap)
        : reject(new Error("Amap did not initialize."));
    script.onerror = () => reject(new Error("Could not load Amap."));
    document.head.appendChild(script);
  });
  return loader;
}

export function AmapMap({ points }: { points: Place[] }) {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<AmapInstance | null>(null);
  const [error, setError] = useState("");
  const [ready, setReady] = useState(false);
  const key = process.env.NEXT_PUBLIC_AMAP_JS_KEY;

  useEffect(() => {
    if (!container.current || !key) return;
    let cancelled = false;
    loadAmap(key)
      .then((AMap) => {
        if (cancelled || !container.current) return;
        map.current = new AMap.Map(container.current, {
          zoom: 12,
          viewMode: "2D",
          mapStyle: "amap://styles/whitesmoke",
        });
        setReady(true);
      })
      .catch(
        (caught) =>
          !cancelled &&
          setError(
            caught instanceof Error ? caught.message : "Could not load Amap.",
          ),
      );
    return () => {
      cancelled = true;
      map.current?.destroy();
      map.current = null;
    };
  }, [key]);

  useEffect(() => {
    const instance = map.current;
    const AMap = window.AMap;
    if (!instance || !AMap) return;
    instance.clearMap();
    if (!points.length) return;
    const markers = points.map(
      (point, index) =>
        new AMap.Marker({
          position: [point.longitude, point.latitude],
          title: point.name,
          content: `<div class="amap-trip-marker"><span>${index + 1}</span><b>${escapeHtml(point.name)}</b></div>`,
          offset: new AMap.Pixel(-13, -13),
        }),
    );
    const overlays = [...markers];
    if (points.length > 1)
      overlays.unshift(
        new AMap.Polyline({
          path: points.map((point) => [point.longitude, point.latitude]),
          strokeColor: "#0d3b40",
          strokeWeight: 4,
          strokeOpacity: 0.9,
          strokeStyle: "dashed",
          lineJoin: "round",
          lineCap: "round",
          zIndex: 40,
        }),
      );
    instance.add(overlays);
    instance.setFitView(markers, false, [90, 90, 90, 90]);
  }, [points, ready]);

  if (!key)
    return (
      <div className="map-state">
        Add <code>NEXT_PUBLIC_AMAP_JS_KEY</code> to show the live map.
      </div>
    );
  return (
    <>
      <div
        className="amap-container"
        ref={container}
        aria-label="Interactive Amap showing itinerary places"
      />
      {!points.length && (
        <div className="map-state">Waiting for the first stop</div>
      )}
      {error && <div className="map-state map-error">{error}</div>}
    </>
  );
}

function escapeHtml(value: string) {
  return value.replace(
    /[&<>'"]/g,
    (character) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[
        character
      ]!,
  );
}
