import {
  Download,
  Link2,
  LoaderCircle,
  Pencil,
  Play,
  RefreshCw,
  Search,
  Square,
  Trash2,
  TrendingDown,
  TrendingUp,
  Upload,
  UserMinus,
  UserPlus,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Badge, Button, Input, Modal, NativeSelect } from "../../components/ui";
import { db } from "../../db";
import {
  matchedGamePlayer,
  usePlannerStore,
  type GameRosterEntry,
  type GameRosterMatch,
} from "../../store/usePlannerStore";
import type {
  AllianceProfile,
  Availability,
  Player,
  StateSnapshot,
} from "../../types";
import { formatPower } from "../../utils/format";
import {
  AllianceRankBadge,
  playerAllianceRank,
} from "../players/AllianceRankBadge";
import { frankyParticipationLabel } from "../players/availability";
import { PlayerSexIcon } from "../players/PlayerSexIcon";
import {
  checkDarkWarSync,
  finishDarkWarCapture,
  loadDarkWarConnection,
  parseSavedDarkWarRoster,
  startDarkWarCapture,
  type DarkWarConnection,
  type DarkWarRosterResult,
} from "./darkWarSync";
import "./alliance.css";
import "./alliance-game-data.css";
import "./dark-war-sync.css";

const emptyProfile: AllianceProfile = {
  id: "primary",
  name: "",
  tag: "",
  state: "",
  updatedAt: "",
};
function PowerChange({ value }: { value: number | null }) {
  if (value == null)
    return <span className="alliance-change neutral">New</span>;
  const positive = value > 0,
    negative = value < 0,
    Icon = positive ? TrendingUp : TrendingDown;
  return (
    <span
      className={`alliance-change ${positive ? "positive" : negative ? "negative" : "neutral"}`}
    >
      {value !== 0 && <Icon />}
      {positive ? "+" : ""}
      {value.toFixed(1)}%
    </span>
  );
}

const distinctAllianceSnapshots = (snapshots: StateSnapshot[]) => {
  const fingerprints = new Set<string>();
  return snapshots.filter((snapshot) => {
    const members = snapshot.allianceMembers ?? [];
    if (!members.length) return false;
    const fingerprint = members
      .map((member) => `${member.uid}:${member.power}`)
      .sort()
      .join("|");
    if (fingerprints.has(fingerprint)) return false;
    fingerprints.add(fingerprint);
    return true;
  });
};

const distinctPlayerStateSnapshots = (snapshots: StateSnapshot[]) => {
  const fingerprints = new Set<string>();
  return snapshots.filter((snapshot) => {
    if (!snapshot.playerRanking.length) return false;
    const fingerprint = snapshot.playerRanking
      .map((player) => `${player.uid}:${player.rank}:${player.power}`)
      .sort()
      .join("|");
    if (fingerprints.has(fingerprint)) return false;
    fingerprints.add(fingerprint);
    return true;
  });
};

function AllianceGrowthPanel({ snapshots }: { snapshots: StateSnapshot[] }) {
  const available = distinctAllianceSnapshots(snapshots);
  const latest = available[0];
  if (!latest?.allianceMembers?.length) return null;
  const latestAt = new Date(latest.capturedAt).getTime();
  const weekTarget = latestAt - 7 * 24 * 60 * 60 * 1000;
  const weeklyBaseline = available.find(
    (snapshot) => new Date(snapshot.capturedAt).getTime() <= weekTarget,
  );
  const fallbackBaseline = snapshots.find(
    (snapshot) =>
      snapshot.id !== latest.id &&
      !snapshot.allianceMembers?.length &&
      snapshot.playerRanking.length > 0,
  );
  const baseline = weeklyBaseline ?? available[1] ?? fallbackBaseline;
  const hasComparison = Boolean(baseline && baseline.id !== latest.id);
  const currentMembers = latest.allianceMembers;
  const hasFullRosterBaseline = Boolean(baseline?.allianceMembers?.length);
  const baselineMembers = hasFullRosterBaseline
    ? baseline!.allianceMembers!
    : (baseline?.playerRanking ?? []);
  const baselineByUid = new Map(
    baselineMembers.map((member) => [member.uid, member]),
  );
  const totalPower = currentMembers.reduce(
    (total, member) => total + member.power,
    0,
  );
  const baselineTotal = baselineMembers.reduce(
    (total, member) => total + member.power,
    0,
  );
  const matchedCurrentMembers = currentMembers.filter((member) =>
    baselineByUid.has(member.uid),
  );
  const matchedCurrentTotal = matchedCurrentMembers.reduce(
    (total, member) => total + member.power,
    0,
  );
  const matchedBaselineTotal = matchedCurrentMembers.reduce(
    (total, member) => total + (baselineByUid.get(member.uid)?.power ?? 0),
    0,
  );
  const powerGained = hasFullRosterBaseline
    ? totalPower - baselineTotal
    : matchedCurrentTotal - matchedBaselineTotal;
  const totalChange =
    hasComparison && matchedCurrentMembers.length
      ? ((matchedCurrentTotal - matchedBaselineTotal) /
          Math.max(1, matchedBaselineTotal)) *
        100
      : null;
  const memberGrowth = currentMembers
    .map((member) => {
      const before = baselineByUid.get(member.uid);
      return {
        member,
        change:
          before?.power && before.power > 0
            ? ((member.power - before.power) / before.power) * 100
            : null,
        gained: before ? member.power - before.power : null,
      };
    })
    .filter(
      (item): item is typeof item & { change: number; gained: number } =>
        item.change != null && item.gained != null,
    );
  const fastest = [...memberGrowth]
    .sort((a, b) => b.change - a.change)
    .slice(0, 5);
  const slowest = [...memberGrowth]
    .sort((a, b) => a.change - b.change)
    .slice(0, 5);
  const periodLabel = weeklyBaseline
    ? "Last 7 days"
    : hasComparison
      ? `Since ${new Date(baseline!.capturedAt).toLocaleString()}`
      : "Waiting for comparison";
  const GrowthList = ({
    title,
    rows,
    tone,
  }: {
    title: string;
    rows: typeof fastest;
    tone: "positive" | "negative";
  }) => (
    <article className="growth-leaderboard">
      <header>
        <div>
          <h4>{title}</h4>
          <span>{periodLabel}</span>
        </div>
      </header>
      <div>
        {rows.map((item, index) => (
          <div key={item.member.uid}>
            <b>{index + 1}</b>
            <span>
              <strong>{item.member.name}</strong>
              <small>
                {item.gained >= 0 ? "+" : ""}
                {formatPower(item.gained)}
              </small>
            </span>
            <PowerChange value={item.change} />
          </div>
        ))}
        {!rows.length && (
          <p className="growth-empty">
            A second alliance snapshot is required.
          </p>
        )}
      </div>
      <i className={tone} />
    </article>
  );
  return (
    <section className="alliance-growth">
      <header>
        <div>
          <p className="eyebrow">Alliance growth</p>
          <h3>Growth overview</h3>
        </div>
        <span>{periodLabel}</span>
      </header>
      <div className="growth-summary">
        <article>
          <span>Total power</span>
          <strong>{formatPower(totalPower)}</strong>
          <PowerChange value={totalChange} />
        </article>
        <article>
          <span>Average power</span>
          <strong>{formatPower(totalPower / currentMembers.length)}</strong>
          <small>{currentMembers.length} current members</small>
        </article>
        <article>
          <span>Power gained</span>
          <strong className={powerGained >= 0 ? "positive" : "negative"}>
            {hasComparison && powerGained >= 0 ? "+" : ""}
            {hasComparison ? formatPower(powerGained) : "—"}
          </strong>
          <small>
            {hasFullRosterBaseline
              ? "Includes joins and departures"
              : hasComparison
                ? `${matchedCurrentMembers.length} members matched to prior State data`
                : "Waiting for comparison"}
          </small>
        </article>
        <article>
          <span>Tracked updates</span>
          <strong>{available.length}</strong>
          <small>Up to 30 cloud snapshots</small>
        </article>
      </div>
      <div className="growth-rankings">
        <GrowthList
          title="Fastest rising members"
          rows={fastest}
          tone="positive"
        />
        <GrowthList
          title="Lowest growth members"
          rows={slowest}
          tone="negative"
        />
      </div>
    </section>
  );
}

export function AllianceHub({
  onEdit,
  gameDataOpen,
  onGameDataOpenChange,
  canEdit = true,
}: {
  onEdit: (player: Player | null) => void;
  gameDataOpen: boolean;
  onGameDataOpenChange: (open: boolean) => void;
  canEdit?: boolean;
}) {
  const players = usePlannerStore((state) => state.players);
  const deletePlayer = usePlannerStore((state) => state.deletePlayer);
  const archivePlayersByUid = usePlannerStore(
    (state) => state.archivePlayersByUid,
  );
  const syncGameRoster = usePlannerStore((state) => state.syncGameRoster);
  const [profile, setProfile] = useState<AllianceProfile>(emptyProfile);
  const [snapshots, setSnapshots] = useState<StateSnapshot[]>([]);
  const [query, setQuery] = useState("");
  const [availability, setAvailability] = useState<"all" | Availability>("all");
  const [sort, setSort] = useState<"power" | "kills" | "name" | "hq">("power");
  const [syncConnection, setSyncConnection] =
    useState<DarkWarConnection | null>(null);
  const [syncState, setSyncState] = useState<
    "disconnected" | "checking" | "ready" | "capturing" | "importing"
  >("checking");
  const [syncMessage, setSyncMessage] = useState(
    "Checking the local Dark War helper…",
  );
  const [syncReviewOpen, setSyncReviewOpen] = useState(false);
  const [pendingRoster, setPendingRoster] = useState<GameRosterEntry[]>([]);
  const [pendingStateSnapshot, setPendingStateSnapshot] = useState<
    StateSnapshot | undefined
  >();
  const [pendingStatePatches, setPendingStatePatches] = useState<
    StateSnapshot[]
  >([]);
  const [pendingHasRosterUpdate, setPendingHasRosterUpdate] = useState(false);
  const [syncMatches, setSyncMatches] = useState<
    Record<string, GameRosterMatch>
  >({});
  const isProfileAlliance = (entry: GameRosterEntry) =>
    Boolean(
      (entry.uid && entry.allianceRank) ||
      (profile.tag.trim() &&
        entry.allianceTag &&
        entry.allianceTag.trim().toLocaleLowerCase() ===
          profile.tag.trim().toLocaleLowerCase()),
    );
  useEffect(() => {
    void db.allianceProfiles
      .get("primary")
      .then((saved) => saved && setProfile(saved));
  }, []);
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
  useEffect(() => {
    const connection = loadDarkWarConnection();
    setSyncConnection(connection);
    if (!connection) {
      setSyncState("disconnected");
      setSyncMessage("Start the Windows sync helper to connect this browser.");
      return;
    }
    void checkDarkWarSync(connection)
      .then((result) => {
        setSyncState(result.capturing ? "capturing" : "ready");
        setSyncMessage(
          result.capturing
            ? "Capture is running. Open Alliance ranking → CP in Dark War."
            : "Local helper connected.",
        );
      })
      .catch(() => {
        setSyncState("disconnected");
        setSyncMessage(
          "The saved helper connection is offline. Start the Windows sync helper again.",
        );
      });
  }, []);
  const beginGameSync = async () => {
    if (!syncConnection) return;
    setSyncState("checking");
    try {
      await startDarkWarCapture(syncConnection);
      setSyncState("capturing");
      setSyncMessage(
        "Open Alliance members, State player kills, State player power and State alliance power, then click Finish & import.",
      );
    } catch (error) {
      setSyncState("ready");
      setSyncMessage(
        error instanceof Error ? error.message : "Unable to start capture.",
      );
    }
  };
  const reviewRoster = (result: DarkWarRosterResult) => {
    const entries = result.players;
    const own = entries.filter(isProfileAlliance);
    const currentMembers = own
      .filter((entry) => entry.uid)
      .map((entry) => ({
        uid: entry.uid!,
        name: entry.name,
        power: entry.power,
        totalKills: entry.totalKills ?? null,
        level: entry.mainBuildingLevel ?? null,
        allianceRank: entry.allianceRank,
      }));
    const previousAllianceSnapshot = snapshots.find(
      (snapshot) => snapshot.allianceMembers?.length,
    );
    const previousMembers = previousAllianceSnapshot?.allianceMembers ?? [];
    const currentByUid = new Map(
      currentMembers.map((member) => [member.uid, member]),
    );
    const previousMemberByUid = new Map(
      previousMembers.map((member) => [member.uid, member]),
    );
    const reliableRoster =
      previousMembers.length > 0 &&
      currentMembers.length >= previousMembers.length * 0.75;
    const previousPlayerState = snapshots.find(
      (snapshot) => snapshot.playerRanking.length,
    );
    const previousAllianceState = snapshots.find(
      (snapshot) => snapshot.allianceRanking.length,
    );
    const playerKills = new Map(
      (result.statePlayerKillRanking ?? []).map((row) => [
        row.uid,
        row.totalKills,
      ]),
    );
    const allianceKills = new Map(
      (result.stateAllianceKillRanking ?? []).map((row) => [
        row.uid,
        row.totalKills,
      ]),
    );
    const capturedState = result.stateSnapshot;
    const capturedPlayerPower = capturedState?.playerRanking.length
      ? capturedState.playerRanking
      : [];
    const capturedAlliancePower = capturedState?.allianceRanking.length
      ? capturedState.allianceRanking
      : [];
    const hasRosterUpdate = currentMembers.length > 0;
    const hasPowerUpdate = Boolean(
      capturedPlayerPower.length || capturedAlliancePower.length,
    );
    const statePatches = new Map<string, StateSnapshot>();
    const patchSnapshot = (
      base: StateSnapshot | undefined,
      patch: (snapshot: StateSnapshot) => StateSnapshot,
    ) => {
      if (!base) return;
      const current = statePatches.get(base.id) ?? structuredClone(base);
      statePatches.set(base.id, patch(current));
    };
    if (playerKills.size && !capturedPlayerPower.length)
      patchSnapshot(previousPlayerState, (snapshot) => ({
        ...snapshot,
        playerRanking: snapshot.playerRanking.map((row) => ({
          ...row,
          totalKills: playerKills.get(row.uid) ?? row.totalKills,
        })),
      }));
    if (allianceKills.size && !capturedAlliancePower.length)
      patchSnapshot(previousAllianceState, (snapshot) => ({
        ...snapshot,
        allianceRanking: snapshot.allianceRanking.map((row) => ({
          ...row,
          totalKills: allianceKills.get(row.uid) ?? row.totalKills,
        })),
      }));
    const detectedAt = result.capturedAt;
    const newChanges = reliableRoster
      ? [
          ...currentMembers
            .filter((member) => !previousMemberByUid.has(member.uid))
            .map((member) => ({
              id: `${detectedAt}:joined:${member.uid}`,
              uid: member.uid,
              name: member.name,
              type: "joined" as const,
              detectedAt,
              power: member.power,
              totalKills: member.totalKills,
              allianceRank: member.allianceRank,
            })),
          ...previousMembers
            .filter((member) => !currentByUid.has(member.uid))
            .map((member) => ({
              id: `${detectedAt}:left:${member.uid}`,
              uid: member.uid,
              name: member.name,
              type: "left" as const,
              detectedAt,
              power: member.power,
              totalKills: member.totalKills,
              allianceRank: member.allianceRank,
            })),
        ]
      : [];
    const historyCutoff =
      new Date(detectedAt).getTime() - 90 * 24 * 60 * 60 * 1000;
    const membershipChanges = [
      ...(previousAllianceSnapshot?.membershipChanges ?? []).filter(
        (change) => new Date(change.detectedAt).getTime() >= historyCutoff,
      ),
      ...newChanges,
    ].slice(-200);
    setPendingRoster(hasRosterUpdate ? entries : []);
    setPendingHasRosterUpdate(hasRosterUpdate);
    setPendingStatePatches([...statePatches.values()]);
    setPendingStateSnapshot(
      hasRosterUpdate || hasPowerUpdate
        ? {
            id: result.capturedAt,
            capturedAt: result.capturedAt,
            playerRanking: capturedPlayerPower.map((row) => ({
              ...row,
              totalKills: playerKills.get(row.uid) ?? row.totalKills,
            })),
            allianceRanking: capturedAlliancePower.map((row) => ({
              ...row,
              totalKills: allianceKills.get(row.uid) ?? row.totalKills,
            })),
            ...(hasRosterUpdate
              ? { allianceMembers: currentMembers, membershipChanges }
              : {}),
          }
        : undefined,
    );
    setSyncMatches({});
    onGameDataOpenChange(false);
    setSyncReviewOpen(true);
    setSyncState("ready");
    const exact = own.filter((entry) =>
      matchedGamePlayer(players, entry.name, entry.uid),
    ).length;
    setSyncMessage(
      `Read ${hasRosterUpdate ? entries.length : 0} alliance members · ${exact} matched by UID/name · ${capturedPlayerPower.length} State power rows · ${playerKills.size} player kill rows · ${capturedAlliancePower.length} alliance power rows.`,
    );
  };
  const finishGameSync = async () => {
    if (!syncConnection) return;
    setSyncState("importing");
    try {
      reviewRoster(await finishDarkWarCapture(syncConnection));
    } catch (error) {
      setSyncState("ready");
      setSyncMessage(
        error instanceof Error
          ? error.message
          : "Unable to import the game data.",
      );
    }
  };
  const loadSavedRoster = async (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      reviewRoster(parseSavedDarkWarRoster(await file.text()));
    } catch (error) {
      setSyncMessage(
        error instanceof Error
          ? error.message
          : "Unable to read the saved game data.",
      );
    } finally {
      event.target.value = "";
    }
  };
  const applyGameSync = () => {
    const selected = pendingRoster.filter(
      (entry) =>
        isProfileAlliance(entry) ||
        (syncMatches[entry.uid ?? entry.name] &&
          syncMatches[entry.uid ?? entry.name] !== "skip"),
    );
    const previousMembers =
      snapshots.find((snapshot) => snapshot.allianceMembers?.length)
        ?.allianceMembers ?? [];
    const currentUids = new Set(
      (pendingStateSnapshot?.allianceMembers ?? []).map((member) => member.uid),
    );
    if (
      pendingHasRosterUpdate &&
      previousMembers.length > 0 &&
      currentUids.size >= previousMembers.length * 0.75
    )
      archivePlayersByUid(
        previousMembers
          .filter((member) => !currentUids.has(member.uid))
          .map((member) => member.uid),
      );
    const summary = pendingHasRosterUpdate
      ? syncGameRoster(selected, syncMatches)
      : { added: 0, updated: 0, skipped: 0, aliased: 0 };
    const snapshotsToSave = [
      ...pendingStatePatches,
      ...(pendingStateSnapshot ? [pendingStateSnapshot] : []),
    ];
    if (snapshotsToSave.length)
      void db
        .transaction("rw", db.stateSnapshots, async () => {
          await db.stateSnapshots.bulkPut(snapshotsToSave);
        })
        .then(() => window.dispatchEvent(new Event("planner-local-change")));
    setSyncReviewOpen(false);
    setSyncMessage(
      `Sync complete · ${summary.added} added · ${summary.updated} members updated${summary.aliased ? ` · ${summary.aliased} renamed` : ""}${snapshotsToSave.length ? ` · ${snapshotsToSave.length} data update${snapshotsToSave.length === 1 ? "" : "s"} saved` : ""}.`,
    );
  };
  const allianceSnapshots = useMemo(
    () => distinctAllianceSnapshots(snapshots),
    [snapshots],
  );
  const playerStateSnapshots = useMemo(
    () => distinctPlayerStateSnapshots(snapshots),
    [snapshots],
  );
  const fallbackComparisonSnapshot = useMemo(() => {
    if (allianceSnapshots[1]) return allianceSnapshots[1];
    const latestAllianceTime = allianceSnapshots[0]
      ? new Date(allianceSnapshots[0].capturedAt).getTime()
      : Number.POSITIVE_INFINITY;
    return playerStateSnapshots.find(
      (snapshot) =>
        new Date(snapshot.capturedAt).getTime() < latestAllianceTime,
    );
  }, [allianceSnapshots, playerStateSnapshots]);
  const latestByUid = useMemo(
    () =>
      new Map(
        (allianceSnapshots[0]?.allianceMembers ?? []).map((row) => [
          row.uid,
          row,
        ]),
      ),
    [allianceSnapshots],
  );
  const previousByUid = useMemo(
    () =>
      new Map(
        (fallbackComparisonSnapshot?.allianceMembers?.length
          ? fallbackComparisonSnapshot.allianceMembers
          : (fallbackComparisonSnapshot?.playerRanking ?? [])
        ).map((row) => [row.uid, row]),
      ),
    [fallbackComparisonSnapshot],
  );
  const latestStateByUid = useMemo(
    () =>
      new Map(
        (playerStateSnapshots[0]?.playerRanking ?? []).map((row) => [
          row.uid,
          row,
        ]),
      ),
    [playerStateSnapshots],
  );
  const previousStateByUid = useMemo(
    () =>
      new Map(
        (playerStateSnapshots[1]?.playerRanking ?? []).map((row) => [
          row.uid,
          row,
        ]),
      ),
    [playerStateSnapshots],
  );
  const movementHistory = useMemo(
    () =>
      [...(allianceSnapshots[0]?.membershipChanges ?? [])].sort(
        (a, b) =>
          new Date(b.detectedAt).getTime() - new Date(a.detectedAt).getTime(),
      ),
    [allianceSnapshots],
  );
  const trackedFormerMembers = useMemo(() => {
    const latestChange = new Map<string, (typeof movementHistory)[number]>();
    movementHistory.forEach((change) => {
      if (!latestChange.has(change.uid)) latestChange.set(change.uid, change);
    });
    return [...latestChange.values()].filter((change) => change.type === "left")
      .length;
  }, [movementHistory]);
  const killsOf = (player: Player) =>
    player.totalKills ??
    (player.uid
      ? (latestByUid.get(player.uid)?.totalKills ?? undefined)
      : undefined);
  const powerChangeOf = (player: Player) => {
    if (!player.uid) return null;
    const previous = previousByUid.get(player.uid)?.power;
    if (!previous) return null;
    const current = latestByUid.get(player.uid)?.power ?? player.totalPower;
    return ((current - previous) / previous) * 100;
  };
  const ranked = useMemo(
    () =>
      players
        .filter((player) =>
          player.name.toLowerCase().includes(query.toLowerCase()),
        )
        .filter(
          (player) =>
            availability === "all" || player.availability === availability,
        )
        .sort((a, b) =>
          sort === "name"
            ? a.name.localeCompare(b.name)
            : sort === "hq"
              ? (b.mainBuildingLevel ?? -1) - (a.mainBuildingLevel ?? -1) ||
                a.name.localeCompare(b.name)
              : sort === "kills"
                ? (killsOf(b) ?? -1) - (killsOf(a) ?? -1) ||
                  a.name.localeCompare(b.name)
                : b.totalPower - a.totalPower || a.name.localeCompare(b.name),
        ),
    [players, query, availability, sort, latestByUid],
  );

  return (
    <main className="alliance-shell">
      <section className="alliance-hero">
        <div>
          <p className="eyebrow">Alliance center</p>
          <h2>
            {profile.tag && <span>[{profile.tag}] </span>}
            {profile.name || "Your alliance"}{" "}
            <small>#{(profile.state || "716").replace(/^#/, "")}</small>
          </h2>
          <p>
            Manage the shared player roster used by Rally Planner and Battle
            Map.
          </p>
        </div>
      </section>
      <div className="alliance-grid">
        <AllianceGrowthPanel snapshots={snapshots} />
        <section className="alliance-card alliance-ranking">
          <header>
            <div>
              <h3>
                Alliance members{" "}
                <span>
                  {ranked.length}/{players.length}
                </span>
              </h3>
            </div>
          </header>
          <div className="alliance-player-tools">
            <div className="alliance-search">
              <Search />
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search players"
              />
            </div>
            <NativeSelect
              value={availability}
              onChange={(event) =>
                setAvailability(event.target.value as "all" | Availability)
              }
              aria-label="Filter Franky round participation"
            >
              <option value="all">All Franky rounds</option>
              <option value="both">Round 1 & Round 2</option>
              <option value="round1">Round 1</option>
              <option value="round2">Round 2</option>
              <option value="unavailable">Not participating</option>
            </NativeSelect>
            <NativeSelect
              value={sort}
              onChange={(event) => setSort(event.target.value as typeof sort)}
              aria-label="Sort members"
            >
              <option value="power">Power: high to low</option>
              <option value="kills">Kills: high to low</option>
              <option value="hq">HQ: high to low</option>
              <option value="name">Name: A to Z</option>
            </NativeSelect>
          </div>
          <div className="ranking-head">
            <span>Rank</span>
            <button
              className={sort === "name" ? "active" : ""}
              onClick={() => setSort("name")}
            >
              Player
            </button>
            <button
              className={sort === "hq" ? "active" : ""}
              onClick={() => setSort("hq")}
            >
              HQ
            </button>
            <button
              className={sort === "power" ? "active" : ""}
              onClick={() => setSort("power")}
            >
              Total power
            </button>
            <button
              className={sort === "kills" ? "active" : ""}
              onClick={() => setSort("kills")}
            >
              Total kills
            </button>
            <span>Change</span>
            <span>Franky</span>
            <span />
          </div>
          <div className="ranking-list">
            {ranked.map((player, index) => {
              const kills = killsOf(player);
              return (
                <article key={player.id}>
                  <b>#{index + 1}</b>
                  <span>
                    <strong className="alliance-player-name">
                      <AllianceRankBadge rank={playerAllianceRank(player)} />
                      <PlayerSexIcon sex={player.sex} />
                      {player.name}
                    </strong>
                    <small>
                      F1 {formatPower(player.formations[1].power)} · F2{" "}
                      {formatPower(player.formations[2].power)} · F3{" "}
                      {formatPower(player.formations[3].power)} · F4{" "}
                      {formatPower(player.formations[4].power)}
                    </small>
                  </span>
                  <strong>Lv. {player.mainBuildingLevel ?? "—"}</strong>
                  <strong>{formatPower(player.totalPower)}</strong>
                  <strong>{kills == null ? "—" : formatPower(kills)}</strong>
                  <PowerChange value={powerChangeOf(player)} />
                  <Badge
                    tone={
                      player.availability === "unavailable" ? "muted" : "blue"
                    }
                  >
                    {frankyParticipationLabel(player.availability)}
                  </Badge>
                  <span className="ranking-actions">
                    {canEdit && (
                      <>
                        <button
                          onClick={() => onEdit(player)}
                          aria-label={`Edit ${player.name}`}
                          title="Edit player"
                        >
                          <Pencil />
                        </button>
                        <button
                          onClick={() => {
                            if (
                              confirm(
                                `Delete ${player.name} from the alliance? This also removes them from rally plans.`,
                              )
                            )
                              deletePlayer(player.id);
                          }}
                          aria-label={`Delete ${player.name}`}
                          title="Delete player"
                        >
                          <Trash2 />
                        </button>
                      </>
                    )}
                  </span>
                </article>
              );
            })}
            {!ranked.length && (
              <div className="alliance-empty">
                No players match these filters.
              </div>
            )}
          </div>
        </section>
        <section className="alliance-card membership-history">
          <header>
            <div>
              <h3>Alliance movement</h3>
              <p>Joined and departed members are detected by permanent UID.</p>
            </div>
            <Badge tone="amber">{trackedFormerMembers} former tracked</Badge>
          </header>
          <div className="membership-history-head">
            <span>Movement</span>
            <span>Player</span>
            <span>Detected</span>
            <span>Current alliance</span>
            <span>Power</span>
            <span>Activity</span>
          </div>
          <div className="membership-history-list">
            {movementHistory.map((change) => {
              const current = latestStateByUid.get(change.uid);
              const before = previousStateByUid.get(change.uid);
              const changed = Boolean(
                current &&
                before &&
                (current.power !== before.power ||
                  current.totalKills !== before.totalKills),
              );
              const currentAlliance =
                change.type === "joined"
                  ? `[${profile.tag}] ${profile.name}`
                  : current
                    ? `${current.allianceTag ? `[${current.allianceTag}] ` : ""}${current.allianceName || "No alliance"}`
                    : "Not found in State ranking";
              const activity =
                change.type === "joined"
                  ? "Current member"
                  : !current
                    ? "Unknown"
                    : changed
                      ? "Active"
                      : before
                        ? "No recent change"
                        : "Seen in State";
              return (
                <article key={change.id}>
                  <Badge tone={change.type === "joined" ? "green" : "red"}>
                    {change.type === "joined" ? <UserPlus /> : <UserMinus />}
                    {change.type === "joined" ? "Joined" : "Left"}
                  </Badge>
                  <strong>{change.name}</strong>
                  <span>
                    {new Date(change.detectedAt).toLocaleString("tr-TR", {
                      dateStyle: "short",
                      timeStyle: "short",
                    })}
                  </span>
                  <span>{currentAlliance}</span>
                  <strong>{formatPower(current?.power ?? change.power)}</strong>
                  <Badge
                    tone={
                      activity === "Active"
                        ? "green"
                        : activity === "Unknown"
                          ? "muted"
                          : "blue"
                    }
                  >
                    {activity}
                  </Badge>
                </article>
              );
            })}
            {!movementHistory.length && (
              <div className="membership-history-empty">
                Movement tracking starts after two complete alliance scans.
              </div>
            )}
          </div>
        </section>
      </div>
      <Modal
        open={canEdit && gameDataOpen}
        onOpenChange={onGameDataOpenChange}
        title="Dark War game data"
      >
        <section className={`game-sync game-sync-${syncState}`}>
          <header>
            <div>
              <p className="eyebrow">Game data</p>
              <h3>Alliance & State sync</h3>
            </div>
            {syncState === "ready" ? (
              <Badge tone="green">
                <Link2 />
                Connected
              </Badge>
            ) : syncState === "capturing" ? (
              <Badge tone="blue">
                <RefreshCw />
                Capturing
              </Badge>
            ) : (
              <Badge tone="muted">Windows app</Badge>
            )}
          </header>
          <p>{syncMessage}</p>
          <p className="helper">
            One Game Data JSON can contain Alliance and State sections. Only
            sections present in the file are updated; missing sections remain
            unchanged.
          </p>
          {syncState === "disconnected" && (
            <a
              className="btn btn-secondary wide"
              href="./downloads/KVI-DarkWar-Sync.exe"
              download
            >
              <Download />
              Download KVI Sync app
            </a>
          )}
          {syncState === "ready" && (
            <Button className="wide" onClick={() => void beginGameSync()}>
              <Play />
              Start capture
            </Button>
          )}
          {syncState === "capturing" && (
            <Button className="wide" onClick={() => void finishGameSync()}>
              <Square />
              Finish & import
            </Button>
          )}
          {(syncState === "checking" || syncState === "importing") && (
            <Button className="wide" disabled>
              <LoaderCircle className="sync-spin" />
              {syncState === "importing" ? "Reading game data…" : "Connecting…"}
            </Button>
          )}
          <label className="btn btn-secondary wide game-sync-file">
            <Upload />
            Load one Game Data JSON
            <input
              type="file"
              accept=".json,application/json"
              hidden
              onChange={(event) => void loadSavedRoster(event)}
            />
          </label>
        </section>
      </Modal>
      <Modal
        open={syncReviewOpen}
        onOpenChange={setSyncReviewOpen}
        title="Review Game Data update"
        wide
      >
        <div className="sync-review">
          <p>
            Alliance members, State power and State kills are applied
            independently. A missing category will not replace existing data.
          </p>
          <div className="sync-review-summary">
            {pendingHasRosterUpdate && (
              <>
                <Badge tone="green">
                  {pendingRoster.filter(isProfileAlliance).length} alliance
                  members
                </Badge>
                <Badge tone="blue">
                  {
                    pendingRoster.filter(
                      (entry) =>
                        entry.uid &&
                        matchedGamePlayer(players, entry.name, entry.uid),
                    ).length
                  }{" "}
                  UID matches
                </Badge>
              </>
            )}
            {pendingStateSnapshot &&
              (pendingStateSnapshot.playerRanking.length > 0 ||
                pendingStateSnapshot.allianceRanking.length > 0) && (
                <Badge tone="amber">
                  State: {pendingStateSnapshot.playerRanking.length} players ·{" "}
                  {pendingStateSnapshot.allianceRanking.length} alliances
                </Badge>
              )}
            {pendingStatePatches.length > 0 && (
              <Badge tone="blue">State kills: existing snapshot only</Badge>
            )}
          </div>
          {pendingHasRosterUpdate && (
            <div className="sync-review-head">
              <span>Rank</span>
              <span>Game player</span>
              <span>HQ</span>
              <span>Power</span>
              <span>UID match</span>
            </div>
          )}
          {pendingHasRosterUpdate ? (
            <div className="sync-review-list">
              {pendingRoster.map((entry) => {
                const own = isProfileAlliance(entry),
                  automatic = own
                    ? matchedGamePlayer(players, entry.name, entry.uid)
                    : undefined,
                  key = entry.uid ?? entry.name;
                return (
                  <div
                    key={key}
                    className={
                      automatic
                        ? "matched"
                        : own
                          ? "own-alliance"
                          : "other-alliance"
                    }
                  >
                    <b>{entry.allianceRank ?? `#${entry.rank}`}</b>
                    <strong>{entry.name}</strong>
                    <span>Lv. {entry.mainBuildingLevel ?? "—"}</span>
                    <span>{formatPower(entry.power)}</span>
                    {automatic ? (
                      <span className="sync-auto-match">
                        <Link2 />
                        {automatic.name}
                      </span>
                    ) : own ? (
                      <NativeSelect
                        value={syncMatches[key] ?? "new"}
                        onChange={(event) =>
                          setSyncMatches((value) => ({
                            ...value,
                            [key]: event.target.value,
                          }))
                        }
                      >
                        <option value="new">Add as new member</option>
                        <option value="skip">Skip this player</option>
                        <optgroup label="Match existing member">
                          {[...players]
                            .sort((a, b) => a.name.localeCompare(b.name))
                            .map((player) => (
                              <option key={player.id} value={player.id}>
                                {player.name} · {formatPower(player.totalPower)}
                              </option>
                            ))}
                        </optgroup>
                      </NativeSelect>
                    ) : (
                      <span>Skipped: other alliance</span>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="sync-review-empty">
              No Alliance roster was included. Existing Alliance members will
              not be changed.
            </div>
          )}
          <div className="sync-review-actions">
            <span />
            <Button
              variant="secondary"
              onClick={() => setSyncReviewOpen(false)}
            >
              Cancel
            </Button>
            <Button onClick={applyGameSync}>Apply game update</Button>
          </div>
        </div>
      </Modal>
    </main>
  );
}
