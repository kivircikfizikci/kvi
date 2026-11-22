import {
  ArrowDown,
  ArrowUp,
  Building2,
  History,
  Search,
  TrendingDown,
  TrendingUp,
  UsersRound,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Input } from "../../components/ui";
import { db } from "../../db";
import { usePlannerStore } from "../../store/usePlannerStore";
import type {
  StateAllianceRanking,
  StatePlayerRanking,
  StateSnapshot,
} from "../../types";
import { formatPower } from "../../utils/format";
import { PlayerSexIcon } from "../players/PlayerSexIcon";
import "./state.css";

type SortKey =
  "rank" | "name" | "level" | "power" | "kills" | "leader" | "members";
const delta = (current: number, previous?: number) =>
  previous && previous > 0 ? ((current - previous) / previous) * 100 : null;
function Change({
  value,
  rankChange,
}: {
  value: number | null;
  rankChange?: number;
}) {
  if (value == null)
    return <span className="state-change state-change-new">New</span>;
  const positive = value > 0,
    negative = value < 0,
    Icon = positive ? TrendingUp : TrendingDown;
  return (
    <span
      className={`state-change ${positive ? "positive" : negative ? "negative" : "neutral"}`}
    >
      {value !== 0 && <Icon />}
      {value > 0 ? "+" : ""}
      {value.toFixed(1)}%
      {rankChange
        ? ` · ${rankChange > 0 ? "↑" : "↓"}${Math.abs(rankChange)}`
        : ""}
    </span>
  );
}
function SortButton({
  label,
  value,
  active,
  direction,
  onSort,
}: {
  label: string;
  value: SortKey;
  active: SortKey;
  direction: "asc" | "desc";
  onSort: (key: SortKey) => void;
}) {
  return (
    <button
      className={active === value ? "active" : ""}
      onClick={() => onSort(value)}
    >
      {label}
      {active === value && (direction === "asc" ? <ArrowUp /> : <ArrowDown />)}
    </button>
  );
}

export function StateHub() {
  const alliancePlayers = usePlannerStore((state) => state.players);
  const showHistory = usePlannerStore((state) => state.cloudCanEdit);
  const [snapshots, setSnapshots] = useState<StateSnapshot[]>([]),
    [mode, setMode] = useState<"players" | "alliances">("players"),
    [query, setQuery] = useState(""),
    [sort, setSort] = useState<SortKey>("rank"),
    [direction, setDirection] = useState<"asc" | "desc">("asc"),
    [selectedUid, setSelectedUid] = useState("");
  useEffect(() => {
    const load = () =>
      void db.stateSnapshots
        .orderBy("capturedAt")
        .reverse()
        .limit(30)
        .toArray()
        .then(setSnapshots);
    load();
    window.addEventListener("planner-local-change", load);
    return () => window.removeEventListener("planner-local-change", load);
  }, []);
  const latest = snapshots[0],
    previous = snapshots[1],
    sexByUid = useMemo(
      () =>
        new Map(
          alliancePlayers
            .filter((player) => player.uid)
            .map((player) => [player.uid!, player.sex]),
        ),
      [alliancePlayers],
    ),
    killsByUid = useMemo(
      () =>
        new Map(
          alliancePlayers
            .filter((player) => player.uid)
            .map((player) => [player.uid!, player.totalKills]),
        ),
      [alliancePlayers],
    );
  useEffect(() => {
    if (!latest?.playerRanking.length) return;
    if (!latest.playerRanking.some((row) => row.uid === selectedUid))
      setSelectedUid(latest.playerRanking[0].uid);
  }, [latest, selectedUid]);
  const selectedPlayer = latest?.playerRanking.find(
    (row) => row.uid === selectedUid,
  );
  const selectedHistory = useMemo(
    () =>
      snapshots
        .map((snapshot) => {
          const row = snapshot.playerRanking.find(
            (player) => player.uid === selectedUid,
          );
          return row
            ? {
                capturedAt: snapshot.capturedAt,
                power: row.power,
                rank: row.rank,
              }
            : null;
        })
        .filter(
          (
            point,
          ): point is { capturedAt: string; power: number; rank: number } =>
            point != null,
        )
        .reverse(),
    [snapshots, selectedUid],
  );
  const onSort = (key: SortKey) => {
    if (sort === key)
      setDirection((value) => (value === "asc" ? "desc" : "asc"));
    else {
      setSort(key);
      setDirection(key === "rank" || key === "name" ? "asc" : "desc");
    }
  };
  const compare = (a: string | number, b: string | number) =>
    typeof a === "string" && typeof b === "string"
      ? a.localeCompare(b)
      : Number(a) - Number(b);
  const players = useMemo(() => {
    if (!latest) return [];
    const before = new Map(
        (previous?.playerRanking ?? []).map((row) => [row.uid, row]),
      ),
      value = (row: StatePlayerRanking) =>
        sort === "name"
          ? `${row.allianceTag} ${row.name}`
          : sort === "level"
            ? (row.level ?? -1)
            : sort === "power"
              ? row.power
              : sort === "kills"
                ? (row.totalKills ?? killsByUid.get(row.uid) ?? -1)
                : row.rank;
    return latest.playerRanking
      .filter((row) =>
        `${row.name} ${row.allianceName} ${row.allianceTag}`
          .toLowerCase()
          .includes(query.toLowerCase()),
      )
      .map((row) => ({ row, before: before.get(row.uid) }))
      .sort(
        (a, b) =>
          compare(value(a.row), value(b.row)) * (direction === "asc" ? 1 : -1),
      );
  }, [latest, previous, query, sort, direction, killsByUid]);
  const alliances = useMemo(() => {
    if (!latest) return [];
    const before = new Map(
        (previous?.allianceRanking ?? []).map((row) => [row.uid, row]),
      ),
      value = (row: StateAllianceRanking) =>
        sort === "name"
          ? `${row.tag} ${row.name}`
          : sort === "leader"
            ? row.leader
            : sort === "members"
              ? row.currentMembers
              : sort === "power"
                ? row.power
                : row.rank;
    return latest.allianceRanking
      .filter((row) =>
        `${row.name} ${row.tag} ${row.leader}`
          .toLowerCase()
          .includes(query.toLowerCase()),
      )
      .map((row) => ({ row, before: before.get(row.uid) }))
      .sort(
        (a, b) =>
          compare(value(a.row), value(b.row)) * (direction === "asc" ? 1 : -1),
      );
  }, [latest, previous, query, sort, direction]);
  const changeMode = (next: "players" | "alliances") => {
    setMode(next);
    setSort("rank");
    setDirection("asc");
  };
  return (
    <main className="state-shell">
      <section className="state-hero">
        <div>
          <p className="eyebrow">State intelligence</p>
          <h2>State rankings</h2>
          <p>Power snapshots from Dark War, compared by permanent UID.</p>
        </div>
        {latest && (
          <div>
            <strong>{new Date(latest.capturedAt).toLocaleString()}</strong>
            <small>
              {snapshots.length} saved update{snapshots.length === 1 ? "" : "s"}
            </small>
          </div>
        )}
      </section>
      {!latest ? (
        <section className="state-empty">
          <Building2 />
          <h3>No state snapshot yet</h3>
          <p>Import a full Dark War game-data JSON from the Alliance tab.</p>
        </section>
      ) : (
        <>
          <section className="state-summary">
            <article>
              <UsersRound />
              <span>
                Ranked players<strong>{latest.playerRanking.length}</strong>
              </span>
            </article>
            <article>
              <Building2 />
              <span>
                Ranked alliances<strong>{latest.allianceRanking.length}</strong>
              </span>
            </article>
            <article>
              <span>
                Top player
                <strong>{latest.playerRanking[0]?.name ?? "—"}</strong>
                <small>
                  {formatPower(latest.playerRanking[0]?.power ?? 0)}
                </small>
              </span>
            </article>
            <article>
              <span>
                Top alliance
                <strong>
                  [{latest.allianceRanking[0]?.tag}]{" "}
                  {latest.allianceRanking[0]?.name}
                </strong>
                <small>
                  {formatPower(latest.allianceRanking[0]?.power ?? 0)}
                </small>
              </span>
            </article>
          </section>
          {showHistory && mode === "players" && selectedPlayer && (
            <PowerHistory player={selectedPlayer} points={selectedHistory} />
          )}
          <section className="state-card">
            <header>
              <div className="state-tabs">
                <button
                  className={mode === "players" ? "active" : ""}
                  onClick={() => changeMode("players")}
                >
                  Player power
                </button>
                <button
                  className={mode === "alliances" ? "active" : ""}
                  onClick={() => changeMode("alliances")}
                >
                  Alliance power
                </button>
              </div>
              <div className="state-search">
                <Search />
                <Input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search ranking"
                />
              </div>
            </header>
            {mode === "players" ? (
              <PlayerRanking
                rows={players}
                sexByUid={sexByUid}
                killsByUid={killsByUid}
                sort={sort}
                direction={direction}
                onSort={onSort}
                selectedUid={showHistory ? selectedUid : ""}
                onSelect={showHistory ? setSelectedUid : undefined}
              />
            ) : (
              <AllianceRanking
                rows={alliances}
                sort={sort}
                direction={direction}
                onSort={onSort}
              />
            )}
          </section>
        </>
      )}
    </main>
  );
}

function PowerHistory({
  player,
  points,
}: {
  player: StatePlayerRanking;
  points: { capturedAt: string; power: number; rank: number }[];
}) {
  const values = points.map((point) => point.power);
  const minimum = Math.min(...values);
  const maximum = Math.max(...values);
  const range = Math.max(1, maximum - minimum);
  const chartPoints = points
    .map((point, index) => {
      const x =
        points.length === 1 ? 320 : 16 + (index / (points.length - 1)) * 608;
      const y = 134 - ((point.power - minimum) / range) * 112;
      return `${x},${y}`;
    })
    .join(" ");
  const first = points[0];
  const last = points[points.length - 1];
  const historyChange = last && first ? delta(last.power, first.power) : null;
  return (
    <section className="state-history-card">
      <header>
        <div>
          <p className="eyebrow">
            <History /> Power history
          </p>
          <h3>
            [{player.allianceTag || "—"}] {player.name}
          </h3>
          <span>
            {points.length} saved ranking snapshots · click another player below
          </span>
        </div>
        <div className="state-history-metrics">
          <span>
            Current<strong>{formatPower(last?.power ?? player.power)}</strong>
          </span>
          <span>
            Peak<strong>{formatPower(maximum || player.power)}</strong>
          </span>
          <span>
            Period change
            <strong>
              <Change value={historyChange} />
            </strong>
          </span>
        </div>
      </header>
      <div className="state-history-chart">
        {points.length > 1 ? (
          <svg
            viewBox="0 0 640 150"
            role="img"
            aria-label={`${player.name} power history`}
          >
            <line x1="16" y1="22" x2="624" y2="22" />
            <line x1="16" y1="78" x2="624" y2="78" />
            <line x1="16" y1="134" x2="624" y2="134" />
            <polyline points={chartPoints} />
            {points.map((point, index) => {
              const [x, y] = chartPoints.split(" ")[index].split(",");
              return (
                <circle
                  key={`${point.capturedAt}-${point.rank}`}
                  cx={x}
                  cy={y}
                  r="4"
                >
                  <title>{`${new Date(point.capturedAt).toLocaleString()} · ${formatPower(point.power)} · Rank #${point.rank}`}</title>
                </circle>
              );
            })}
          </svg>
        ) : (
          <div className="state-history-waiting">
            A second State scan will start this graph.
          </div>
        )}
        {first && last && (
          <div className="state-history-dates">
            <span>{new Date(first.capturedAt).toLocaleDateString()}</span>
            <span>{new Date(last.capturedAt).toLocaleDateString()}</span>
          </div>
        )}
      </div>
    </section>
  );
}

function PlayerRanking({
  rows,
  sexByUid,
  killsByUid,
  sort,
  direction,
  onSort,
  selectedUid,
  onSelect,
}: {
  rows: { row: StatePlayerRanking; before?: StatePlayerRanking }[];
  sexByUid: Map<string, 0 | 1 | 2 | null | undefined>;
  killsByUid: Map<string, number | null | undefined>;
  sort: SortKey;
  direction: "asc" | "desc";
  onSort: (key: SortKey) => void;
  selectedUid: string;
  onSelect?: (uid: string) => void;
}) {
  return (
    <div className="state-table state-player-table">
      <div className="state-table-head">
        <SortButton
          label="Rank"
          value="rank"
          active={sort}
          direction={direction}
          onSort={onSort}
        />
        <SortButton
          label="Player"
          value="name"
          active={sort}
          direction={direction}
          onSort={onSort}
        />
        <SortButton
          label="HQ"
          value="level"
          active={sort}
          direction={direction}
          onSort={onSort}
        />
        <SortButton
          label="Total power"
          value="power"
          active={sort}
          direction={direction}
          onSort={onSort}
        />
        <SortButton
          label="Total kills"
          value="kills"
          active={sort}
          direction={direction}
          onSort={onSort}
        />
        <span>Change</span>
      </div>
      {rows.map(({ row, before }) => {
        const kills = row.totalKills ?? killsByUid.get(row.uid);
        return (
          <article
            key={row.uid}
            className={selectedUid === row.uid ? "selected" : ""}
            onClick={() => onSelect?.(row.uid)}
            role={onSelect ? "button" : undefined}
            tabIndex={onSelect ? 0 : undefined}
            onKeyDown={(event) => {
              if (onSelect && (event.key === "Enter" || event.key === " "))
                onSelect(row.uid);
            }}
          >
            <b>#{row.rank}</b>
            <span>
              <strong>
                <PlayerSexIcon sex={row.sex ?? sexByUid.get(row.uid)} />[
                {row.allianceTag || "—"}] {row.name}
              </strong>
              <small>{row.allianceName || "No alliance"}</small>
            </span>
            <span>Lv. {row.level ?? "—"}</span>
            <strong>{formatPower(row.power)}</strong>
            <strong>{kills == null ? "—" : formatPower(kills)}</strong>
            <Change
              value={delta(row.power, before?.power)}
              rankChange={before ? before.rank - row.rank : undefined}
            />
          </article>
        );
      })}
    </div>
  );
}
function AllianceRanking({
  rows,
  sort,
  direction,
  onSort,
}: {
  rows: { row: StateAllianceRanking; before?: StateAllianceRanking }[];
  sort: SortKey;
  direction: "asc" | "desc";
  onSort: (key: SortKey) => void;
}) {
  return (
    <div className="state-table">
      <div className="state-table-head">
        <SortButton
          label="Rank"
          value="rank"
          active={sort}
          direction={direction}
          onSort={onSort}
        />
        <SortButton
          label="Alliance"
          value="name"
          active={sort}
          direction={direction}
          onSort={onSort}
        />
        <SortButton
          label="Leader"
          value="leader"
          active={sort}
          direction={direction}
          onSort={onSort}
        />
        <SortButton
          label="Members"
          value="members"
          active={sort}
          direction={direction}
          onSort={onSort}
        />
        <SortButton
          label="Total power"
          value="power"
          active={sort}
          direction={direction}
          onSort={onSort}
        />
        <span>Change</span>
      </div>
      {rows.map(({ row, before }) => (
        <article key={row.uid}>
          <b>#{row.rank}</b>
          <span>
            <strong>
              [{row.tag}] {row.name}
            </strong>
          </span>
          <span>{row.leader}</span>
          <span>
            {row.currentMembers}/{row.maxMembers}
          </span>
          <strong>{formatPower(row.power)}</strong>
          <Change
            value={delta(row.power, before?.power)}
            rankChange={before ? before.rank - row.rank : undefined}
          />
        </article>
      ))}
    </div>
  );
}
