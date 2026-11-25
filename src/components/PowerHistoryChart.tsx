import { formatPower } from "../utils/format";
import "./power-history-chart.css";

export type PowerHistoryPoint = { capturedAt: string; power: number; rank?: number | null };

const dayFormat = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short" });
const timeFormat = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit" });
const fullFormat = new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short" });
const exactPower = new Intl.NumberFormat("en-GB");

export function PowerHistoryChart({
  name,
  points,
}: {
  name: string;
  points: PowerHistoryPoint[];
}) {
  if (!points.length) return null;

  const values = points.map(point => point.power);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const positions = points.map((point, index) => {
    const date = new Date(point.capturedAt);
    const validDate = Number.isFinite(date.getTime());
    return {
      ...point,
      x: ((index + 0.5) / points.length) * 100,
      y: max === min ? 70 : 122 - ((point.power - min) / (max - min)) * 90,
      day: validDate ? dayFormat.format(date) : "—",
      time: validDate ? timeFormat.format(date) : "",
      timestamp: validDate ? fullFormat.format(date) : "Date unavailable",
    };
  });

  return (
    <div className="power-history-scroll" role="region" tabIndex={0} aria-label={`${name} power history`}>
      <div className="power-history-series" style={{ minWidth: points.length * 74 }}>
        <div className="power-history-plot">
          <svg viewBox="0 0 100 148" preserveAspectRatio="none" aria-hidden="true">
            {[32, 77, 122].map(y => (
              <line key={y} x1="0" x2="100" y1={y} y2={y} vectorEffect="non-scaling-stroke" />
            ))}
            {points.length > 1 && (
              <polyline
                points={positions.map(({ x, y }) => `${x},${y}`).join(" ")}
                vectorEffect="non-scaling-stroke"
              />
            )}
          </svg>
          {positions.map((point, index) => (
            <div
              className="power-history-point"
              key={index}
              style={{ left: `${point.x}%`, top: point.y }}
              title={`${point.timestamp} · ${exactPower.format(point.power)} power${point.rank == null ? "" : ` · Rank #${point.rank}`}`}
            >
              <span>{formatPower(point.power)}</span>
            </div>
          ))}
        </div>
        <div className="power-history-axis" style={{ gridTemplateColumns: `repeat(${points.length}, minmax(0, 1fr))` }}>
          {positions.map((point, index) => (
            <time key={index} dateTime={point.capturedAt} title={point.timestamp}>
              {point.day}<small>{point.time}</small>
            </time>
          ))}
        </div>
      </div>
    </div>
  );
}
