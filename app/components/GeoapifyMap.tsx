"use client";

import { useEffect, useState } from "react";
import type { Place } from "@/lib/domain";

export function GeoapifyMap({
  points,
  isDarkTheme,
}: {
  points: Place[];
  isDarkTheme: boolean;
}) {
  const [failed, setFailed] = useState(false);
  const query = new URLSearchParams({
    points: points
      .slice(0, 12)
      .map((point) => `${point.longitude},${point.latitude}`)
      .join("|"),
    theme: isDarkTheme ? "dark" : "light",
  }).toString();

  useEffect(() => setFailed(false), [query]);

  if (!points.length)
    return <div className="map-state">Waiting for the first stop</div>;
  return (
    <>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        className="map-image"
        src={`/api/static-map?${query}`}
        alt={`Map of ${points.length} itinerary stop${points.length > 1 ? "s" : ""}`}
        onError={() => setFailed(true)}
      />
      {failed && (
        <div className="map-state map-error">
          The map could not be loaded. Check the Geoapify configuration.
        </div>
      )}
    </>
  );
}
