export interface DialStop {
  index: number;
  start: number;
  duration: number;
}

const C = 220;
const TRACK = 176;
const INNER = 104;

function point(minute: number, radius: number) {
  const angle = (minute / 1440) * Math.PI * 2;
  return {
    x: Math.round((C + radius * Math.sin(angle)) * 100) / 100,
    y: Math.round((C - radius * Math.cos(angle)) * 100) / 100,
  };
}

function arc(from: number, to: number, radius: number) {
  const a = Math.max(0, Math.min(1440, from));
  const b = Math.max(a, Math.min(1440, to));
  if (b - a >= 1439.5)
    return `M ${C} ${C - radius} A ${radius} ${radius} 0 1 1 ${C} ${C + radius} A ${radius} ${radius} 0 1 1 ${C} ${C - radius}`;
  const s = point(a, radius);
  const e = point(b, radius);
  return `M ${s.x.toFixed(2)} ${s.y.toFixed(2)} A ${radius} ${radius} 0 ${b - a > 720 ? 1 : 0} 1 ${e.x.toFixed(2)} ${e.y.toFixed(2)}`;
}

export function clock(minutes: number) {
  const total = Math.max(0, Math.min(1439, Math.round(minutes)));
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

function span(minutes: number) {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours} h ${rest} min` : `${hours} h`;
}

export function DayDial({
  start,
  end,
  stops = [],
}: {
  start: number | null;
  end: number | null;
  stops?: DialStop[];
}) {
  const valid = start !== null && end !== null && end > start;
  const description = valid
    ? `Time window from ${clock(start)} to ${clock(end)}${stops.length ? `, ${stops.length} planned ${stops.length === 1 ? "stop" : "stops"}` : ""}.`
    : "Time window not set.";
  return (
    <svg
      className="dial"
      viewBox="0 0 440 440"
      role="img"
      aria-label={description}
    >
      <circle className="dial-outer" cx={C} cy={C} r={212} />
      {Array.from({ length: 24 }, (_, hour) => {
        const major = hour % 6 === 0;
        const from = point(hour * 60, major ? 194 : 198);
        const to = point(hour * 60, 206);
        return (
          <line
            key={hour}
            className={major ? "dial-tick dial-tick-major" : "dial-tick"}
            x1={from.x}
            y1={from.y}
            x2={to.x}
            y2={to.y}
          />
        );
      })}
      <circle className="dial-track" cx={C} cy={C} r={TRACK} />
      {valid && (
        <path
          className="dial-window"
          d={arc(start, end, TRACK)}
          pathLength={1}
        />
      )}
      {[0, 6, 12, 18].map((hour) => {
        const p = point(hour * 60, 140);
        return (
          <text
            key={hour}
            className="dial-label"
            x={p.x}
            y={p.y}
            textAnchor="middle"
            dominantBaseline="central"
          >
            {String(hour).padStart(2, "0")}
          </text>
        );
      })}
      <circle className="dial-inner" cx={C} cy={C} r={INNER} />
      {stops.map((stop) => (
        <path
          key={`arc-${stop.index}`}
          className="dial-stop-arc"
          d={arc(stop.start, stop.start + stop.duration, INNER)}
        />
      ))}
      {stops.map((stop) => {
        const p = point(stop.start + stop.duration / 2, INNER);
        return (
          <g key={`marker-${stop.index}`}>
            <circle className="dial-marker" cx={p.x} cy={p.y} r={12} />
            <text
              className="dial-marker-text"
              x={p.x}
              y={p.y}
              textAnchor="middle"
              dominantBaseline="central"
            >
              {stop.index}
            </text>
          </g>
        );
      })}
      {valid ? (
        <>
          <text
            className="dial-center"
            x={C}
            y={C - 6}
            textAnchor="middle"
            dominantBaseline="central"
          >
            {span(end - start)}
          </text>
          <text
            className="dial-caption"
            x={C}
            y={C + 24}
            textAnchor="middle"
            dominantBaseline="central"
          >
            {clock(start)} to {clock(end)}
          </text>
        </>
      ) : (
        <text
          className="dial-caption"
          x={C}
          y={C}
          textAnchor="middle"
          dominantBaseline="central"
        >
          Set a time window
        </text>
      )}
    </svg>
  );
}
