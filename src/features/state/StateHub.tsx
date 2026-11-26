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
import { PowerHistoryChart } from "../../components/PowerHistoryChart";
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

export function StateHub({ signedIn = false }: { signedIn?: boolean }) {
  const alliancePlayers = usePlannerStore((state) => state.players);
  const showHistory = signedIn;
  const showProfileUpdates = signedIn;
  const [snapshots, setSnapshots] = useState<StateSnapshot[]>([]),
    [mode, setMode] = useState<"players" | "alliances">("players"),
    [query, setQuery] = useState(""),
    [sort, setSort] = useState<SortKey>("rank"),
    [direction, setDirection] = useState<"asc" | "desc">("asc"),
    [selectedUid, setSelectedUid] = useState("");
  const [selectedAllianceUid, setSelectedAllianceUid] = useState("");
  const [rankingStatus, setRankingStatus] = useState<"loading" | "ready" | "error">("loading");
  const [profileUpdates, setProfileUpdates] = useState<Map<string, number>>(new Map());
  useEffect(() => {
    if (!showProfileUpdates) return;
    let active = true;
    const load = async () => {
      const profile = await db.allianceProfiles.get("primary");
      if (active) setProfileUpdates(new Map(
        profile?.gameObservations?.profileUpdates.map((row) => [row.uid, row.lastUpdateTime]),
      ));
    };
    const refresh = () => void load().catch(() => {});
    refresh();
    window.addEventListener("planner-local-change", refresh);
    return () => {
      active = false;
      window.removeEventListener("planner-local-change", refresh);
    };
  }, [showProfileUpdates]);
  useEffect(() => {
    let active = true;
    let request = 0;
    const load = async () => {
      const current = ++request;
      try {
        const latest = await db.stateSnapshots
        .orderBy("capturedAt")
        .reverse()
        .limit(30)
        .toArray();
        if (!active || request !== current) return;
        setSnapshots(latest);
        setRankingStatus("ready");
      } catch {
        if (active && request === current) setRankingStatus("error");
      }
    };
    void load();
    window.addEventListener("planner-local-change", load);
    return () => {
      active = false;
      window.removeEventListener("planner-local-change", load);
    };
  }, []);
  const playerSnapshots = useMemo(
      () =>
        snapshots.filter((snapshot) => snapshot.playerRanking.length),
      [snapshots],
    ),
    allianceSnapshots = useMemo(
      () =>
        snapshots.filter((snapshot) => snapshot.allianceRanking.length),
      [snapshots],
    ),
    rankingSnapshots = useMemo(() => {
      const ids = new Set(
        [...playerSnapshots, ...allianceSnapshots].map(
          (snapshot) => snapshot.id,
        ),
      );
      return snapshots.filter((snapshot) => ids.has(snapshot.id));
    }, [snapshots, playerSnapshots, allianceSnapshots]),
    latestPlayerSnapshot = playerSnapshots[0],
    previousPlayerSnapshot = playerSnapshots[1],
    latestAllianceSnapshot = allianceSnapshots[0],
    previousAllianceSnapshot = allianceSnapshots[1],
    latest = mode === "players" ? latestPlayerSnapshot : latestAllianceSnapshot,
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
    if (!latestPlayerSnapshot?.playerRanking.length) return;
    if (!latestPlayerSnapshot.playerRanking.some((row) => row.uid === selectedUid))
      setSelectedUid(latestPlayerSnapshot.playerRanking[0].uid);
  }, [latestPlayerSnapshot, selectedUid]);
  const selectedPlayer = latestPlayerSnapshot?.playerRanking.find(
    (row) => row.uid === selectedUid,
  );
  const selectedAlliance = latestAllianceSnapshot?.allianceRanking.find(
    (row) => row.uid === selectedAllianceUid,
  ) ?? latestAllianceSnapshot?.allianceRanking[0];
  const previousSelectedAlliance = previousAllianceSnapshot?.allianceRanking.find(
    (row) => row.uid === selectedAlliance?.uid,
  );
  const selectedAllianceHistory = useMemo(
    () => allianceSnapshots.flatMap((snapshot) => {
      const row = snapshot.allianceRanking.find((alliance) => alliance.uid === selectedAlliance?.uid);
      return row ? [{ capturedAt: snapshot.capturedAt, power: row.power, rank: row.rank }] : [];
    }).reverse(),
    [allianceSnapshots, selectedAlliance?.uid],
  );
  const selectAlliance = (uid: string) => {
    setSelectedAllianceUid(uid);
    window.requestAnimationFrame(() => {
      document.getElementById("state-alliance-power-history")?.scrollIntoView({ block: "start" });
    });
  };
  const selectedHistory = useMemo(
    () =>
      playerSnapshots
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
    [playerSnapshots, selectedUid],
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
    if (!latestPlayerSnapshot) return [];
    const before = new Map(
        (previousPlayerSnapshot?.playerRanking ?? []).map((row) => [
          row.uid,
          row,
        ]),
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
    return latestPlayerSnapshot.playerRanking
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
  }, [
    latestPlayerSnapshot,
    previousPlayerSnapshot,
    query,
    sort,
    direction,
    killsByUid,
  ]);
  const alliances = useMemo(() => {
    if (!latestAllianceSnapshot) return [];
    const before = new Map(
        (previousAllianceSnapshot?.allianceRanking ?? []).map((row) => [
          row.uid,
          row,
        ]),
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
    return latestAllianceSnapshot.allianceRanking
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
  }, [
    latestAllianceSnapshot,
    previousAllianceSnapshot,
    query,
    sort,
    direction,
  ]);
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
              {rankingSnapshots.length} saved update
              {rankingSnapshots.length === 1 ? "" : "s"}
            </small>
          </div>
        )}
      </section>
      {rankingStatus !== "ready" || (!latestPlayerSnapshot && !latestAllianceSnapshot) ? (
        <section className="state-empty">
          <Building2 />
          <h3>{rankingStatus === "loading" ? "Loading State rankings" : rankingStatus === "error" ? "State rankings could not be loaded" : "No State snapshot yet"}</h3>
        </section>
      ) : (
        <>
          <section className="state-summary">
            <article>
              <UsersRound />
              <span>
                Ranked players
                <strong>
                  {latestPlayerSnapshot?.playerRanking.length ?? 0}
                </strong>
              </span>
            </article>
            <article>
              <Building2 />
              <span>
                Ranked alliances
                <strong>
                  {latestAllianceSnapshot?.allianceRanking.length ?? 0}
                </strong>
              </span>
            </article>
            <article>
              <span>
                Top player
                <strong>
                  {latestPlayerSnapshot?.playerRanking[0]?.name ?? "—"}
                </strong>
                <small>
                  {formatPower(
                    latestPlayerSnapshot?.playerRanking[0]?.power ?? 0,
                  )}
                </small>
              </span>
            </article>
            <article>
              <span>
                Top alliance
                <strong>
                  [{latestAllianceSnapshot?.allianceRanking[0]?.tag ?? "—"}]{" "}
                  {latestAllianceSnapshot?.allianceRanking[0]?.name ?? "—"}
                </strong>
                <small>
                  {formatPower(
                    latestAllianceSnapshot?.allianceRanking[0]?.power ?? 0,
                  )}
                </small>
              </span>
            </article>
          </section>
          {showHistory && mode === "players" && selectedPlayer && (
            <PowerHistory
              name={selectedPlayer.name}
              tag={selectedPlayer.allianceTag}
              power={selectedPlayer.power}
              points={selectedHistory}
            />
          )}
          {showHistory && mode === "alliances" && selectedAlliance && (
            <PowerHistory
              name={selectedAlliance.name}
              tag={selectedAlliance.tag}
              power={selectedAlliance.power}
              points={selectedAllianceHistory}
              allianceComparison={{
                change: delta(selectedAlliance.power, previousSelectedAlliance?.power),
                rankChange: previousSelectedAlliance ? previousSelectedAlliance.rank - selectedAlliance.rank : undefined,
              }}
            />
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
                  aria-label="Search ranking"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search ranking"
                />
              </div>
            </header>
            {!latest ? (
              <p className="state-ranking-empty" role="status">This ranking has not been captured yet.</p>
            ) : !(mode === "players" ? players.length : alliances.length) ? (
              <p className="state-ranking-empty" role="status">No rankings match your search.</p>
            ) : mode === "players" ? (
              <PlayerRanking
                rows={players}
                profileUpdates={showProfileUpdates ? profileUpdates : undefined}
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
                selectedUid={showHistory ? selectedAlliance?.uid : undefined}
                onSelect={showHistory ? selectAlliance : undefined}
              />
            )}
          </section>
        </>
      )}
    </main>
  );
}

function PowerHistory({
  name,
  tag,
  power,
  points,
  allianceComparison,
}: {
  name: string;
  tag: string;
  power: number;
  points: { capturedAt: string; power: number; rank: number }[];
  allianceComparison?: { change: number | null; rankChange?: number };
}) {
  const first = points[0];
  const last = points[points.length - 1];
  const maximum = points.length ? Math.max(...points.map((point) => point.power)) : power;
  const historyChange = last && first && points.length > 1 ? delta(last.power, first.power) : null;
  const change = allianceComparison ? allianceComparison.change : historyChange;
  return (
    <section id={allianceComparison ? "state-alliance-power-history" : undefined} className="state-history-card">
      <header>
        <div>
          <p className="eyebrow">
            <History /> {allianceComparison ? "Alliance power history" : "Power history"}
          </p>
          <h3>
            [{tag || "—"}] {name}
          </h3>
          <span>
            {points.length} saved ranking snapshots · select {allianceComparison ? "an alliance" : "a player"} below
          </span>
        </div>
        <div className="state-history-metrics">
          <span>
            Current<strong>{formatPower(last?.power ?? power)}</strong>
          </span>
          <span>
            Peak<strong>{formatPower(maximum)}</strong>
          </span>
          <span>
            {allianceComparison ? "Latest change" : "Period change"}
            <strong>
              {change == null ? "—" : <Change value={change} rankChange={allianceComparison?.rankChange} />}
            </strong>
          </span>
        </div>
      </header>
      <div className="state-history-chart">
        <PowerHistoryChart name={name} points={points} />
        {points.length < 2 && <p className="state-history-waiting">A second State scan will start the trend line.</p>}
      </div>
    </section>
  );
}

function PlayerRanking({
  rows,
  profileUpdates,
  sexByUid,
  killsByUid,
  sort,
  direction,
  onSort,
  selectedUid,
  onSelect,
}: {
  rows: { row: StatePlayerRanking; before?: StatePlayerRanking }[];
  profileUpdates?: Map<string, number>;
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
        const profileUpdate = profileUpdates?.get(row.uid);
        return (
          <article
            key={row.uid}
            className={selectedUid === row.uid ? "selected" : ""}
            onClick={() => onSelect?.(row.uid)}
            role={onSelect ? "button" : undefined}
            aria-pressed={onSelect ? selectedUid === row.uid : undefined}
            tabIndex={onSelect ? 0 : undefined}
            onKeyDown={(event) => {
              if (onSelect && (event.key === "Enter" || event.key === " ")) {
                event.preventDefault();
                onSelect(row.uid);
              }
            }}
          >
            <b>#{row.rank}</b>
            <span>
              <strong>
                <PlayerSexIcon sex={row.sex ?? sexByUid.get(row.uid)} />[
                {row.allianceTag || "—"}] {row.name}
              </strong>
              <small>{row.allianceName || "No alliance"}</small>
              {profileUpdate && <small>
                Profile updated · <time dateTime={new Date(profileUpdate * 1000).toISOString()}>
                  {new Date(profileUpdate * 1000).toLocaleString()}
                </time>
              </small>}
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
  selectedUid,
  onSelect,
}: {
  rows: { row: StateAllianceRanking; before?: StateAllianceRanking }[];
  sort: SortKey;
  direction: "asc" | "desc";
  onSort: (key: SortKey) => void;
  selectedUid?: string;
  onSelect?: (uid: string) => void;
}) {
  return (
    <div className="state-table state-alliance-table">
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
        <article
          key={row.uid}
          className={selectedUid === row.uid ? "selected" : ""}
          role={onSelect ? "button" : undefined}
          aria-pressed={onSelect ? selectedUid === row.uid : undefined}
          tabIndex={onSelect ? 0 : undefined}
          onClick={() => onSelect?.(row.uid)}
          onKeyDown={(event) => {
            if (onSelect && (event.key === "Enter" || event.key === " ")) {
              event.preventDefault();
              onSelect(row.uid);
            }
          }}
        >
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
