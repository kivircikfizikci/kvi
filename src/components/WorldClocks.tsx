import { useEffect, useState } from "react";

export const WORLD_CLOCKS = [
  { label: "America", city: "New York", timeZone: "America/New_York" },
  { label: "Europe", city: "Berlin", timeZone: "Europe/Berlin" },
  { label: "Asia", city: "Seoul", timeZone: "Asia/Seoul" },
] as const;

export function formatWorldClock(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";

  return {
    day: value("weekday"),
    time: `${value("hour")}:${value("minute")}:${value("second")}`,
  };
}

export function WorldClocks() {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1_000);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <section className="world-clock-bar" aria-label="Regional current times">
      <div className="world-clock-list">
        {WORLD_CLOCKS.map((clock) => {
          const current = formatWorldClock(now, clock.timeZone);
          return (
            <div
              className="world-clock"
              key={clock.timeZone}
              title={`${clock.city} · ${clock.timeZone}`}
            >
              <span>
                <strong>{clock.label}</strong>
                <small>{clock.city}</small>
              </span>
              <time
                dateTime={now.toISOString()}
                aria-label={`${clock.label}, ${clock.city}: ${current.day} ${current.time}`}
              >
                <small>{current.day}</small>
                {current.time}
              </time>
            </div>
          );
        })}
      </div>
    </section>
  );
}
