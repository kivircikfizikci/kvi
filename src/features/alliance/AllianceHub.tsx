import {
  Download,
  History,
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
import { PowerHistoryChart } from "../../components/PowerHistoryChart";
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
import { isApproximateGrowthSnapshot, nearestGrowthSnapshot, type GrowthRangeDays } from "./growthPeriod";
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

function AllianceGrowthPanel({
  snapshots, allianceSnapshotCount, latest, baseline, rangeDays, setRangeDays, selectedUid, setSelectedUid, selectedPlayer,
}: {
  snapshots: StateSnapshot[];
  allianceSnapshotCount: number;
  latest?: StateSnapshot;
  baseline?: StateSnapshot;
  rangeDays: GrowthRangeDays;
  setRangeDays: (days: GrowthRangeDays) => void;
  selectedUid: string;
  setSelectedUid: (uid: string) => void;
  selectedPlayer?: Player;
}) {
  if (!latest?.allianceMembers?.length) return null;
  const latestAt = new Date(latest.capturedAt).getTime();
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
  const approximate = isApproximateGrowthSnapshot(baseline, latestAt, rangeDays);
  const rangeLabel = `${rangeDays} ${rangeDays === 1 ? "day" : "days"}`;
  const periodLabel = !hasComparison
    ? "Waiting for comparison"
    : approximate
      ? `Nearest available update · since ${new Date(baseline!.capturedAt).toLocaleString()}`
      : `Last ${rangeLabel}`;
  const selectedMember = currentMembers.find((member) => member.uid === selectedUid)
    ?? (selectedPlayer ? {
      uid: selectedPlayer.uid ?? "",
      name: selectedPlayer.name,
      power: selectedPlayer.totalPower,
    } : undefined);
  const selectedGrowth = memberGrowth.find(
    (item) => item.member.uid === selectedUid,
  );
  const selectedHistory = memberPowerHistory(snapshots, selectedMember?.uid);
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
          <button
            key={item.member.uid}
            className={selectedUid === item.member.uid ? "selected" : ""}
            onClick={() => setSelectedUid(item.member.uid)}
          >
            <b>{index + 1}</b>
            <span>
              <strong>{item.member.name}</strong>
              <small>
                {item.gained >= 0 ? "+" : ""}
                {formatPower(item.gained)}
              </small>
            </span>
            <PowerChange value={item.change} />
          </button>
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
        <div className="growth-period-picker">
          <div role="group" aria-label="Growth comparison period">
            {([1, 3, 7] as const).map((days) => (
              <button
                key={days}
                className={rangeDays === days ? "active" : ""}
                aria-pressed={rangeDays === days}
                onClick={() => setRangeDays(days)}
              >
                {days}D
              </button>
            ))}
          </div>
          <span>{periodLabel}</span>
        </div>
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
          <strong>{allianceSnapshotCount}</strong>
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
      {selectedMember && (
        <AllianceMemberHistory
          member={selectedMember}
          points={selectedHistory}
          periodLabel={periodLabel}
          periodChange={selectedGrowth?.change ?? null}
          periodGained={selectedGrowth?.gained ?? null}
        />
      )}
    </section>
  );
}

function memberPowerHistory(snapshots: StateSnapshot[], uid?: string) {
  if (!uid) return [];
  const points = new Map<string, { capturedAt: string; power: number; rank: number | null }>();
  for (const snapshot of snapshots) {
    const ranking = snapshot.playerRanking.find((item) => item.uid === uid);
    const member = snapshot.allianceMembers?.find((item) => item.uid === uid) ?? ranking;
    if (!member) continue;
    const key = `${snapshot.capturedAt}-${member.power}`;
    points.set(key, {
      capturedAt: snapshot.capturedAt,
      power: member.power,
      rank: ranking?.rank ?? points.get(key)?.rank ?? null,
    });
  }
  return [...points.values()].sort((a, b) => Date.parse(a.capturedAt) - Date.parse(b.capturedAt));
}

function AllianceMemberHistory({
  member,
  points,
  periodLabel,
  periodChange,
  periodGained,
}: {
  member: { name: string; power: number };
  points: { capturedAt: string; power: number; rank: number | null }[];
  periodLabel: string;
  periodChange: number | null;
  periodGained: number | null;
}) {
  const last = points[points.length - 1];
  const maximum = points.length ? Math.max(...points.map((point) => point.power)) : member.power;
  return (
    <section id="alliance-member-history" className="alliance-member-history">
      <header>
        <div>
          <p className="eyebrow"><History /> Member power history</p>
          <h3>{member.name}</h3>
          <span>{points.length} saved updates · {periodLabel}</span>
        </div>
        <div className="alliance-history-metrics">
          <span>Current<strong>{formatPower(last?.power ?? member.power)}</strong></span>
          <span>Peak<strong>{formatPower(maximum)}</strong></span>
          <span>Period gain<strong className={(periodGained ?? 0) >= 0 ? "positive" : "negative"}>{periodGained == null ? "—" : `${periodGained >= 0 ? "+" : ""}${formatPower(periodGained)}`}</strong></span>
          <span>Period change<strong><PowerChange value={periodChange} /></strong></span>
        </div>
      </header>
      <div className="alliance-history-chart">
        <PowerHistoryChart name={member.name} points={points} />
        {points.length < 2 && <p className="alliance-history-waiting">Power trends need at least two saved updates.</p>}
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
  const [rangeDays, setRangeDays] = useState<GrowthRangeDays>(1);
  const [selectedUid, setSelectedUid] = useState("");
  const [syncConnection, setSyncConnection] =
    useState<DarkWarConnection | null>(null);
  const [syncState, setSyncState] = useState<
    "disconnected" | "checking" | "ready" | "capturing" | "importing"
  >("checking");
  const [syncMessage, setSyncMessage] = useState(
    "Checking the local Dark War helper…",
  );
  const [syncReviewOpen, setSyncReviewOpen] = useState(false);
  const [applyingGameData, setApplyingGameData] = useState(false);
  const [applyError, setApplyError] = useState("");
  const [applySummary, setApplySummary] = useState("");
  const [pendingRoster, setPendingRoster] = useState<GameRosterEntry[]>([]);
  const [pendingStateSnapshot, setPendingStateSnapshot] = useState<
    StateSnapshot | undefined
  >();
  const [pendingStatePatches, setPendingStatePatches] = useState<
    StateSnapshot[]
  >([]);
  const [pendingHasRosterUpdate, setPendingHasRosterUpdate] = useState(false);
  const [pendingObservations, setPendingObservations] = useState<Pick<
    DarkWarRosterResult, "capturedAt" | "playerPositions" | "playerProfileUpdates"
  > | null>(null);
  const [syncMatches, setSyncMatches] = useState<
    Record<string, GameRosterMatch>
  >({});
  const isProfileAlliance = (entry: GameRosterEntry) => {
    const profileTag = profile.tag.trim().toLowerCase();
    const captureTag = entry.allianceTag?.trim().toLowerCase();
    return profileTag && captureTag ? captureTag === profileTag : Boolean(entry.uid && entry.allianceRank);
  };
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
    setPendingObservations(result);
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
    const isOlderRoster = previousAllianceSnapshot &&
      Date.parse(result.capturedAt) < Date.parse(previousAllianceSnapshot.capturedAt);
    const reliableRoster =
      !isOlderRoster &&
      previousMembers.length > 0 &&
      currentMembers.length >= previousMembers.length * 0.75;
    const previousPlayerState = snapshots.find(
      (snapshot) => snapshot.playerRanking.length,
    );
    const previousAllianceState = snapshots.find(
      (snapshot) => snapshot.allianceRanking.length,
    );
    const captureTime = Date.parse(result.capturedAt);
    const previousPlayerKills = new Map(snapshots
      .find(snapshot => Date.parse(snapshot.capturedAt) <= captureTime && snapshot.playerRanking.length)
      ?.playerRanking.map(row => [row.uid, row.totalKills]));
    const previousAllianceKills = new Map(snapshots
      .find(snapshot => Date.parse(snapshot.capturedAt) <= captureTime && snapshot.allianceRanking.length)
      ?.allianceRanking.map(row => [row.uid, row.totalKills]));
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
    if (playerKills.size && !capturedPlayerPower.length && previousPlayerState &&
      captureTime >= Date.parse(previousPlayerState.capturedAt))
      patchSnapshot(previousPlayerState, (snapshot) => ({
        ...snapshot,
        playerRanking: snapshot.playerRanking.map((row) => ({
          ...row,
          totalKills: playerKills.get(row.uid) ?? row.totalKills,
        })),
      }));
    if (allianceKills.size && !capturedAlliancePower.length && previousAllianceState &&
      captureTime >= Date.parse(previousAllianceState.capturedAt))
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
    setPendingRoster(hasRosterUpdate && !isOlderRoster ? entries : []);
    setPendingHasRosterUpdate(hasRosterUpdate && !isOlderRoster);
    setPendingStatePatches([...statePatches.values()]);
    setPendingStateSnapshot(
      hasRosterUpdate || hasPowerUpdate
        ? {
            id: result.capturedAt,
            capturedAt: result.capturedAt,
            playerRanking: capturedPlayerPower.map((row) => ({
              ...row,
              totalKills: playerKills.get(row.uid) ?? row.totalKills ?? previousPlayerKills.get(row.uid),
            })),
            allianceRanking: capturedAlliancePower.map((row) => ({
              ...row,
              totalKills: allianceKills.get(row.uid) ?? row.totalKills ?? previousAllianceKills.get(row.uid),
            })),
            ...(hasRosterUpdate
              ? { allianceMembers: currentMembers, membershipChanges: isOlderRoster ? [] : membershipChanges }
              : {}),
          }
        : undefined,
    );
    setSyncMatches({});
    setApplyError("");
    setApplySummary("");
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
  const applyGameSync = async () => {
    if (applyingGameData) return;
    setApplyingGameData(true);
    setApplyError("");
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
    const snapshotsToSave = [
      ...pendingStatePatches,
      ...(pendingStateSnapshot ? [pendingStateSnapshot] : []),
    ];
    try {
      await db.transaction("rw", db.stateSnapshots, db.allianceProfiles, async () => {
        if (snapshotsToSave.length)
          await db.stateSnapshots.bulkPut(snapshotsToSave);
        if (!pendingObservations ||
          (!pendingObservations.playerPositions.length && !pendingObservations.playerProfileUpdates.length)) return;
        const saved = (await db.allianceProfiles.get("primary")) ?? profile;
        const positions = new Map(saved.gameObservations?.positions.map((row) => [row.uid, row]));
        const profileUpdates = new Map(saved.gameObservations?.profileUpdates.map((row) => [row.uid, row]));
        for (const row of pendingObservations.playerPositions) {
          const current = positions.get(row.uid);
          if (!current || Date.parse(pendingObservations.capturedAt) >= Date.parse(current.capturedAt))
            positions.set(row.uid, { ...row, capturedAt: pendingObservations.capturedAt });
        }
        for (const row of pendingObservations.playerProfileUpdates) {
          if (row.lastUpdateTime > (profileUpdates.get(row.uid)?.lastUpdateTime ?? 0))
            profileUpdates.set(row.uid, row);
        }
        await db.allianceProfiles.put({
          ...saved,
          gameObservations: {
            positions: [...positions.values()],
            profileUpdates: [...profileUpdates.values()],
          },
        });
      });
      if (pendingHasRosterUpdate && previousMembers.length &&
        currentUids.size >= previousMembers.length * 0.75) {
        archivePlayersByUid(previousMembers.filter(member => !currentUids.has(member.uid)).map(member => member.uid));
      }
      const summary = pendingHasRosterUpdate
        ? syncGameRoster(selected, syncMatches)
        : { added: 0, updated: 0, aliased: 0 };
      window.dispatchEvent(new Event("planner-local-change"));
      const message = `Game data applied · ${summary.added} members added · ${summary.updated} updated${summary.aliased ? ` · ${summary.aliased} renamed` : ""}${snapshotsToSave.length ? ` · ${snapshotsToSave.length} data update${snapshotsToSave.length === 1 ? "" : "s"} saved` : ""}.`;
      setSyncMessage(message);
      setApplySummary(message);
      setSyncReviewOpen(false);
    } catch (error) {
      setApplyError(error instanceof Error ? error.message : "Game data could not be saved.");
    } finally {
      setApplyingGameData(false);
    }
  };
  const allianceSnapshots = useMemo(
    () => distinctAllianceSnapshots(snapshots),
    [snapshots],
  );
  const playerStateSnapshots = useMemo(
    () => distinctPlayerStateSnapshots(snapshots),
    [snapshots],
  );
  const latestAlliance = allianceSnapshots[0];
  const comparisonSnapshot = useMemo(() => {
    const latest = latestAlliance ?? playerStateSnapshots[0];
    if (!latest) return undefined;
    return nearestGrowthSnapshot(
      [...allianceSnapshots.slice(1), ...playerStateSnapshots].filter((snapshot) => snapshot.id !== latest.id),
      Date.parse(latest.capturedAt),
      rangeDays,
    );
  }, [allianceSnapshots, latestAlliance, playerStateSnapshots, rangeDays]);
  const selectedPlayer = selectedUid
    ? players.find((player) => (player.uid || player.id) === selectedUid)
    : undefined;
  const selectRosterPlayer = (player: Player) => {
    setSelectedUid(player.uid || player.id);
    window.requestAnimationFrame(() => {
      document.getElementById("alliance-member-history")?.scrollIntoView({ block: "start" });
    });
  };
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
        (comparisonSnapshot?.allianceMembers?.length
          ? comparisonSnapshot.allianceMembers
          : (comparisonSnapshot?.playerRanking ?? [])
        ).map((row) => [row.uid, row]),
      ),
    [comparisonSnapshot],
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
      {applySummary && <p className="alliance-card game-data-feedback" role="status">{applySummary}</p>}
      <div className="alliance-grid">
        {latestAlliance ? <AllianceGrowthPanel
          snapshots={snapshots}
          allianceSnapshotCount={allianceSnapshots.length}
          latest={latestAlliance}
          baseline={comparisonSnapshot}
          rangeDays={rangeDays}
          setRangeDays={setRangeDays}
          selectedUid={selectedUid}
          setSelectedUid={setSelectedUid}
          selectedPlayer={selectedPlayer}
        /> : selectedPlayer && <AllianceMemberHistory
          member={{ name: selectedPlayer.name, power: selectedPlayer.totalPower }}
          points={memberPowerHistory(snapshots, selectedPlayer.uid)}
          periodLabel="Waiting for an Alliance update"
          periodChange={powerChangeOf(selectedPlayer)}
          periodGained={null}
        />}
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
            <span title={comparisonSnapshot ? `Compared with ${new Date(comparisonSnapshot.capturedAt).toLocaleString()}` : "No comparison update"}>Change ({rangeDays}D)</span>
            <span>Franky</span>
            <span />
          </div>
          <div className="ranking-list">
            {ranked.map((player, index) => {
              const kills = killsOf(player);
              return (
                <article
                  key={player.id}
                  className={(player.uid || player.id) === selectedUid ? "history-selected" : ""}
                  onClick={(event) => {
                    if (!(event.target as Element).closest("button")) selectRosterPlayer(player);
                  }}
                >
                  <b>#{index + 1}</b>
                  <span>
                    <button
                      type="button"
                      className="alliance-player-name alliance-history-trigger"
                      aria-label={`Show power history for ${player.name}`}
                      aria-pressed={(player.uid || player.id) === selectedUid}
                      onClick={() => selectRosterPlayer(player)}
                    >
                      <AllianceRankBadge rank={playerAllianceRank(player)} />
                      <PlayerSexIcon sex={player.sex} />
                      {player.name}
                    </button>
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
        onOpenChange={(open) => { if (!applyingGameData) setSyncReviewOpen(open); }}
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
              {pendingStateSnapshot?.allianceMembers?.length
                ? "This older Alliance roster will be saved to history."
                : "No Alliance roster update in this capture."}
            </div>
          )}
          {applyError && <p className="access-error" role="alert">{applyError}</p>}
          <div className="sync-review-actions">
            <span />
            <Button
              variant="secondary"
              disabled={applyingGameData}
              onClick={() => setSyncReviewOpen(false)}
            >
              Cancel
            </Button>
            <Button disabled={applyingGameData} onClick={() => void applyGameSync()}>
              {applyingGameData ? "Applying game update…" : "Apply game update"}
            </Button>
          </div>
        </div>
      </Modal>
    </main>
  );
}
