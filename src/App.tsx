import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import {
  Clock3,
  Cloud,
  Copy,
  Crown,
  Database,
  LogIn,
  LogOut,
  Plus,
  Shield,
  Trash2,
  UserRoundCheck,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Badge, Button, Input, NativeSelect } from "./components/ui";
import { WorldClocks } from "./components/WorldClocks";
import { exportBoardPng } from "./features/import-export/dataTools";
import { Overview } from "./features/planning/Overview";
import { RallyBoard } from "./features/planning/RallyBoard";
import { PlayerEditor } from "./features/players/PlayerEditor";
import { PlayerRoster } from "./features/players/PlayerRoster";
import { selectActivePlan, usePlannerStore } from "./store/usePlannerStore";
import type { FormationId, Player, RoundId } from "./types";
import { formatPower } from "./utils/format";
import { rallyMetrics } from "./features/planning/rules";
import { BattleMap } from "./features/battle-map/BattleMap";
import {
  initialModule,
  moduleUrl,
  PLANNER_MODULES,
  type PlannerModuleId,
} from "./app/moduleRegistry";
import { AllianceHub } from "./features/alliance/AllianceHub";
import { OfficerNotes } from "./features/officer-notes/OfficerNotes";
import { StateHub } from "./features/state/StateHub";
import {
  applyCloudSnapshot,
  applyPublicState,
  collectCloudSnapshot,
  fetchCloudState,
  fetchPublicState,
  loginWithUid,
  saveCloudState,
  validateCloudSession,
  type CloudRole,
  type CloudSnapshot,
} from "./cloud/cloudClient";

type CloudAccess = {
  loading: boolean;
  entered: boolean;
  submitting: boolean;
  role: CloudRole;
  label: string;
  token: string;
  revision: number;
  hasData: boolean;
  error: string | null;
};

const authKeys = [
  "kvi-cloud-token",
  "kvi-cloud-role",
  "kvi-cloud-label",
  "kvi-cloud-user-uid",
  "kvi-cloud-remember",
  "kvi-officer-player-id",
] as const;
const readAuth = (key: (typeof authKeys)[number]) =>
  localStorage.getItem(key) ?? sessionStorage.getItem(key);
const clearAuth = (keys: readonly (typeof authKeys)[number][] = authKeys) =>
  keys.forEach((key) => {
    localStorage.removeItem(key);
    sessionStorage.removeItem(key);
  });
const currentAuthStorage = (): Storage =>
  localStorage.getItem("kvi-cloud-remember") === "true" ||
  Boolean(localStorage.getItem("kvi-cloud-token"))
    ? localStorage
    : sessionStorage;

export default function App() {
  const initialize = usePlannerStore((s) => s.initialize);
  const loaded = usePlannerStore((s) => s.loaded);
  const canEdit = usePlannerStore((s) => s.cloudCanEdit);
  const setCloudCanEdit = usePlannerStore((s) => s.setCloudCanEdit);
  const error = usePlannerStore((s) => s.error);
  const setError = usePlannerStore((s) => s.setError);
  const plan = usePlannerStore(selectActivePlan);
  const players = usePlannerStore((s) => s.players);
  const plans = usePlannerStore((s) => s.plans);
  const activeId = usePlannerStore((s) => s.activePlanId);
  const setActive = usePlannerStore((s) => s.setActivePlan);
  const addPlan = usePlannerStore((s) => s.addPlan);
  const duplicatePlan = usePlannerStore((s) => s.duplicatePlan);
  const deletePlan = usePlannerStore((s) => s.deletePlan);
  const renamePlan = usePlannerStore((s) => s.renamePlan);
  const savePlayer = usePlannerStore((s) => s.savePlayer);
  const assign = usePlannerStore((s) => s.assign);
  const remove = usePlannerStore((s) => s.removeAssignment);
  const moveParticipant = usePlannerStore((s) => s.moveParticipant);
  const reorder = usePlannerStore((s) => s.reorderRally);
  const updateRoundTime = usePlannerStore((s) => s.updateRoundTime);
  const [activeModule, setActiveModule] = useState<PlannerModuleId>(() =>
    initialModule(window.location.search),
  );
  const [round, setRound] = useState<RoundId>(1);
  const [editor, setEditor] = useState<Player | null | undefined>(undefined);
  const [gameDataOpen, setGameDataOpen] = useState(false);
  const [activePlayer, setActivePlayer] = useState<Player | null>(null);
  const [officerPlayerId, setOfficerPlayerId] = useState(
    () => readAuth("kvi-officer-player-id") ?? "",
  );
  const [cloud, setCloud] = useState<CloudAccess>({
    loading: true,
    entered: false,
    submitting: false,
    role: "viewer",
    label: "Visitor",
    token: "",
    revision: 0,
    hasData: false,
    error: null,
  });
  const exportRef = useRef<HTMLDivElement>(null);
  const localSnapshotRef = useRef<CloudSnapshot | null>(null);
  const revisionRef = useRef(0);
  const openModule = (id: PlannerModuleId) => {
    setActiveModule(id);
    window.history.replaceState({}, "", moduleUrl());
  };
  useEffect(() => {
    window.history.replaceState({}, "", moduleUrl());
  }, []);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 160, tolerance: 8 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );
  useEffect(() => {
    void initialize();
  }, [initialize]);
  useEffect(() => {
    if (!loaded) return;
    let live = true;
    void (async () => {
      try {
        const local = await collectCloudSnapshot();
        localSnapshotRef.current = local;
        const token = readAuth("kvi-cloud-token") ?? "",
          storedRole = readAuth("kvi-cloud-role") as CloudRole | null,
          label = readAuth("kvi-cloud-label") ?? "Alliance member";
        if (
          token &&
          (storedRole === "member" ||
            storedRole === "r4" ||
            storedRole === "r5")
        ) {
          const session = await validateCloudSession(token),
            remote = await fetchCloudState(token),
            editable = session.role === "r4" || session.role === "r5";
          if (remote.state) await applyCloudSnapshot(remote.state);
          setCloudCanEdit(editable);
          revisionRef.current = remote.revision;
          let revision = remote.revision,
            hasData = Boolean(remote.state);
          if (editable && !remote.state) {
            const saved = await saveCloudState(token, local, revision);
            revision = saved.revision;
            revisionRef.current = revision;
            hasData = true;
          }
          if (live)
            setCloud({
              loading: false,
              entered: true,
              submitting: false,
              role: session.role,
              label,
              token,
              revision,
              hasData,
              error: null,
            });
        } else {
          const publicState = await fetchPublicState();
          await applyPublicState(publicState.stateSnapshots);
          setCloudCanEdit(false);
          if (live)
            setCloud({
              loading: false,
              entered: false,
              submitting: false,
              role: "viewer",
              label: "Visitor",
              token: "",
              revision: 0,
              hasData: publicState.stateSnapshots.length > 0,
              error: null,
            });
        }
      } catch (err) {
        const status = (err as { status?: number } | null)?.status;
        if (status === 401 || status === 403)
          clearAuth(["kvi-cloud-token", "kvi-cloud-role", "kvi-cloud-label"]);
        setCloudCanEdit(false);
        let hasData = false;
        if (status === 401 || status === 403) {
          try {
            const publicState = await fetchPublicState();
            await applyPublicState(publicState.stateSnapshots);
            hasData = publicState.stateSnapshots.length > 0;
          } catch {
            // The original session error is shown below.
          }
        }
        if (live)
          setCloud((value) => ({
            ...value,
            loading: false,
            entered: false,
            role: "viewer",
            token: "",
            hasData,
            error:
              err instanceof Error
                ? err.message
                : "Cloud service is unavailable.",
          }));
      }
    })();
    return () => {
      live = false;
    };
  }, [loaded, setCloudCanEdit]);
  useEffect(() => {
    if (!canEdit || !cloud.token) return;
    let active = true;
    let timer: number | undefined;
    let saving = false;
    let pending = false;
    const flushSave = async () => {
      if (saving) return;
      saving = true;
      try {
        while (pending && active) {
          pending = false;
          const snapshot = await collectCloudSnapshot();
          if (!active) return;
          const result = await saveCloudState(
            cloud.token,
            snapshot,
            revisionRef.current,
          );
          if (!active) return;
          revisionRef.current = result.revision;
          setCloud((value) => ({
            ...value,
            revision: result.revision,
            hasData: true,
            error: null,
          }));
        }
      } catch (err) {
        if (!active) return;
        pending = false;
        const message =
          err instanceof Error ? err.message : "Cloud save failed.";
        setCloud((value) => ({ ...value, error: message }));
        setError(message);
      } finally {
        saving = false;
      }
    };
    const save = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        pending = true;
        void flushSave();
      }, 350);
    };
    window.addEventListener("planner-local-change", save);
    return () => {
      active = false;
      window.removeEventListener("planner-local-change", save);
      window.clearTimeout(timer);
    };
  }, [canEdit, cloud.token, setError]);
  const login = async (uid: string, remember: boolean) => {
    setCloud((value) => ({ ...value, submitting: true, error: null }));
    try {
      const auth = await loginWithUid(uid),
        remote = await fetchCloudState(auth.token),
        editable = auth.role === "r4" || auth.role === "r5";
      if (remote.state) await applyCloudSnapshot(remote.state);
      clearAuth();
      setOfficerPlayerId("");
      const authStorage = remember ? localStorage : sessionStorage;
      authStorage.setItem("kvi-cloud-token", auth.token);
      authStorage.setItem("kvi-cloud-role", auth.role);
      authStorage.setItem("kvi-cloud-label", auth.label);
      authStorage.setItem("kvi-cloud-user-uid", uid);
      authStorage.setItem("kvi-cloud-remember", String(remember));
      const member = usePlannerStore
        .getState()
        .players.find((player) => player.uid === uid || player.id === uid);
      if (editable && member) {
        authStorage.setItem("kvi-officer-player-id", member.id);
        setOfficerPlayerId(member.id);
      }
      setCloudCanEdit(editable);
      revisionRef.current = remote.revision;
      let revision = remote.revision,
        hasData = Boolean(remote.state);
      if (editable && !hasData && localSnapshotRef.current) {
        const saved = await saveCloudState(
          auth.token,
          localSnapshotRef.current,
          revision,
        );
        revision = saved.revision;
        revisionRef.current = revision;
        hasData = true;
      }
      setCloud({
        loading: false,
        entered: true,
        submitting: false,
        role: auth.role,
        label: auth.label,
        token: auth.token,
        revision,
        hasData,
        error: null,
      });
    } catch (err) {
      setCloud((value) => ({
        ...value,
        submitting: false,
        error: err instanceof Error ? err.message : "Sign in failed.",
      }));
    }
  };
  const enterViewer = () => {
    setCloudCanEdit(false);
    openModule("state");
    setCloud((value) => ({
      ...value,
      entered: true,
      role: "viewer",
      label: "Visitor",
      token: "",
      error: null,
    }));
  };
  const logout = () => {
    const rememberedUid =
      localStorage.getItem("kvi-cloud-remember") === "true"
        ? localStorage.getItem("kvi-cloud-user-uid")
        : null;
    clearAuth();
    if (rememberedUid) {
      localStorage.setItem("kvi-cloud-user-uid", rememberedUid);
      localStorage.setItem("kvi-cloud-remember", "true");
    }
    setOfficerPlayerId("");
    setCloudCanEdit(false);
    setCloud((value) => ({
      ...value,
      loading: Boolean(value.token),
      entered: false,
      role: "viewer",
      label: "Visitor",
      token: "",
      error: null,
    }));
    if (!cloud.token) return;
    void (async () => {
      let hasData = false;
      let error: string | null = null;
      try {
        const publicState = await fetchPublicState();
        await applyPublicState(publicState.stateSnapshots);
        hasData = publicState.stateSnapshots.length > 0;
      } catch {
        error = "Public State data could not be loaded.";
        try {
          await applyPublicState([]);
        } catch {
          error = "Public State data could not be loaded and the local cache could not be cleared.";
        }
      }
      setCloud((value) => ({ ...value, loading: false, hasData, error }));
    })();
  };
  const selectOfficerPlayer = (playerId: string) => {
    currentAuthStorage().setItem("kvi-officer-player-id", playerId);
    setOfficerPlayerId(playerId);
  };
  useEffect(() => {
    if (!canEdit) return;
    const loginUid = readAuth("kvi-cloud-user-uid");
    if (!loginUid) return;
    const member = players.find(
      (player) => player.uid === loginUid || player.id === loginUid,
    );
    if (member && member.id !== officerPlayerId) {
      currentAuthStorage().setItem("kvi-officer-player-id", member.id);
      setOfficerPlayerId(member.id);
    }
  }, [canEdit, officerPlayerId, players]);
  const dragStart = (e: DragStartEvent) => {
    if (!canEdit) return;
    const id = e.active.data.current?.playerId as string | undefined;
    if (id) setActivePlayer(players.find((p) => p.id === id) ?? null);
  };
  const dragEnd = (e: DragEndEvent) => {
    setActivePlayer(null);
    if (!canEdit || !e.over) return;
    const a = e.active.data.current,
      o = e.over.data.current;
    if (a?.type === "rally" && o?.type === "rally") {
      reorder(a.round, e.active.id as string, e.over.id as string);
      return;
    }
    if (!a?.playerId) return;
    const player = players.find((p) => p.id === a.playerId);
    if (!player) return;
    if (o?.type === "unassigned") {
      if (a.sourceRally) remove(a.sourceRound, a.sourceRally, player.id);
      return;
    }
    if (o?.type === "rally") {
      if (a.sourceRally) {
        moveParticipant(a.sourceRound, a.sourceRally, o.round, o.rallyId, player.id);
        return;
      }
      const formation =
        ([1, 2, 3, 4] as FormationId[])
          .filter((f) => player.formations[f].power != null)
          .sort(
            (x, y) =>
              (player.formations[y].power ?? 0) -
              (player.formations[x].power ?? 0),
          )[0] ?? 1;
      assign(o.round, o.rallyId, player.id, formation, false);
    }
  };
  if (!loaded || cloud.loading)
    return (
      <div className="splash">
        <div className="brand-mark">
          <Shield />
        </div>
        <h1>Preparing the war room</h1>
        <span>Loading shared alliance data…</span>
      </div>
    );
  if (!cloud.entered)
    return (
      <AccessScreen
        hasData={cloud.hasData}
        submitting={cloud.submitting}
        error={cloud.error}
        onLogin={login}
        onViewer={enterViewer}
      />
    );
  const officerPlayer = players.find((player) => player.id === officerPlayerId);
  if (canEdit && !officerPlayer)
    return (
      <OfficerIdentityScreen
        players={players}
        role={cloud.role}
        onSelect={selectOfficerPlayer}
        onLogout={logout}
      />
    );
  const signedIn = cloud.role !== "viewer",
    sessionLabel = signedIn
      ? `${canEdit && officerPlayer ? officerPlayer.name : cloud.label} · ${cloud.role.toUpperCase()}`
      : "Visitor · State only";
  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={dragStart}
      onDragEnd={dragEnd}
      onDragCancel={() => setActivePlayer(null)}
    >
      <div className={`app-shell ${canEdit ? "" : "app-read-only"}`}>
        <header className="topbar">
          <button
            className="brand brand-home"
            type="button"
            onClick={() =>
              openModule(cloud.role === "viewer" ? "state" : "alliance")
            }
            aria-label="Go to KVI Planner home"
          >
            <div className="brand-mark">
              <Shield />
            </div>
            <div>
              <p>KVI · DARK WAR: SURVIVAL</p>
              <h1>Planner</h1>
            </div>
          </button>
          <nav className="app-nav">
            {PLANNER_MODULES.filter(
              (module) => cloud.role !== "viewer" || module.id === "state",
            ).map((module) => {
              const Icon = module.icon;
              return (
                <button
                  key={module.id}
                  className={activeModule === module.id ? "active" : ""}
                  onClick={() => openModule(module.id)}
                  title={module.description}
                >
                  <Icon />
                  {module.label}
                </button>
              );
            })}
          </nav>
          <WorldClocks />
          <div className="navbar-session">
            <Badge tone={canEdit ? "green" : signedIn ? "blue" : "muted"}>
              <Cloud />
              {sessionLabel}
            </Badge>
            {canEdit && activeModule === "alliance" && (
              <Button
                variant="secondary"
                onClick={() => setGameDataOpen((value) => !value)}
              >
                <Database />
                Game data
              </Button>
            )}
            <Button variant="secondary" onClick={logout}>
              {signedIn ? (
                <>
                  <LogOut />
                  Logout
                </>
              ) : (
                <>
                  <LogIn />
                  Sign in
                </>
              )}
            </Button>
          </div>
        </header>
        {(error || cloud.error) && (
          <div className="toast" role="alert">
            <span>{error || cloud.error}</span>
            <button
              onClick={() => {
                setError(null);
                setCloud((value) => ({ ...value, error: null }));
              }}
            >
              ×
            </button>
          </div>
        )}
        {activeModule === "rally-planner" ? (
          <>
            <div className="mobile-tabs">
              <button className="active">Roster & plan</button>
              <button
                onClick={() =>
                  document
                    .querySelector(".overview")
                    ?.scrollIntoView({ behavior: "smooth" })
                }
              >
                Overview
              </button>
            </div>
            <main className="workspace">
              <PlayerRoster
                onEdit={(p) => canEdit && setEditor(p)}
                headerSlot={
                  <section className="roster-plan-picker">
                    <label htmlFor="active-rally-plan">Active plan</label>
                    <div className="roster-plan-row">
                      <NativeSelect
                        id="active-rally-plan"
                        value={activeId}
                        onChange={(e) => setActive(e.target.value)}
                      >
                        {plans.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name}
                          </option>
                        ))}
                      </NativeSelect>
                      {canEdit && (
                        <div className="roster-plan-actions">
                          <Button
                            variant="ghost"
                            onClick={addPlan}
                            title="New plan"
                            aria-label="New plan"
                          >
                            <Plus />
                          </Button>
                          <Button
                            variant="ghost"
                            onClick={() => plan && duplicatePlan(plan.id)}
                            title="Duplicate plan"
                            aria-label="Duplicate plan"
                          >
                            <Copy />
                          </Button>
                          <Button
                            variant="ghost"
                            disabled={plans.length <= 1}
                            onClick={() => plan && deletePlan(plan.id)}
                            title="Delete plan"
                            aria-label="Delete plan"
                          >
                            <Trash2 />
                          </Button>
                        </div>
                      )}
                    </div>
                  </section>
                }
              />
              <section className="center-panel">
                <div className="round-tabs">
                  <button
                    className={round === 1 ? "active" : ""}
                    onClick={() => setRound(1)}
                  >
                    Round 1 <span>{plan?.rounds[1].length ?? 0} rallies</span>
                  </button>
                  <button
                    className={round === 2 ? "active" : ""}
                    onClick={() => setRound(2)}
                  >
                    Round 2 <span>{plan?.rounds[2].length ?? 0} rallies</span>
                  </button>
                  {plan && (
                    <button
                      className="plan-name"
                      onClick={() => {
                        if (!canEdit) return;
                        const v = prompt("Rename plan", plan.name);
                        if (v?.trim()) renamePlan(plan.id, v.trim());
                      }}
                    >
                      {plan.name}
                    </button>
                  )}
                </div>
                {plan && (
                  <div className="round-time-controls">
                    <Clock3 />
                    <strong>Event times</strong>
                    {([1, 2] as RoundId[]).map((id) => (
                      <label key={id}>
                        <span>Round {id}</span>
                        <Input
                          disabled={!canEdit}
                          type="time"
                          value={plan.roundTimes[id]}
                          onChange={(e) => updateRoundTime(id, e.target.value)}
                          aria-label={`Round ${id} event time`}
                        />
                      </label>
                    ))}
                  </div>
                )}
                <RallyBoard round={round} />
              </section>
              <Overview
                onExport={() =>
                  exportRef.current &&
                  void exportBoardPng(exportRef.current, plan?.name ?? "plan")
                }
              />
            </main>
            {plan && (
              <ExportSheet ref={exportRef} plan={plan} players={players} />
            )}
            <DragOverlay>
              {activePlayer && (
                <div className="drag-overlay">
                  <strong>{activePlayer.name}</strong>
                  <span>{formatPower(activePlayer.totalPower)}</span>
                </div>
              )}
            </DragOverlay>
          </>
        ) : activeModule === "battle-map" ? (
          <BattleMap canEdit={canEdit} />
        ) : activeModule === "state" ? (
          <StateHub signedIn={signedIn} />
        ) : activeModule === "officer-notes" ? (
          <OfficerNotes
            canEdit={canEdit}
            author={`${officerPlayer?.name ?? cloud.label} (${cloud.role.toUpperCase()})`}
          />
        ) : (
          <AllianceHub
            canEdit={canEdit}
            onEdit={(player) => canEdit && setEditor(player)}
            gameDataOpen={gameDataOpen}
            onGameDataOpenChange={setGameDataOpen}
          />
        )}
        <PlayerEditor
          open={canEdit && editor !== undefined}
          onOpenChange={(v) => !v && setEditor(undefined)}
          player={editor ?? null}
          onSave={savePlayer}
        />
      </div>
    </DndContext>
  );
}

function OfficerIdentityScreen({
  players,
  role,
  onSelect,
  onLogout,
}: {
  players: Player[];
  role: CloudRole;
  onSelect: (playerId: string) => void;
  onLogout: () => void;
}) {
  const [selected, setSelected] = useState("");
  const sorted = [...players].sort((a, b) => a.name.localeCompare(b.name));
  const player = players.find((item) => item.id === selected);
  return (
    <main className="access-screen">
      <section className="access-card officer-identity-card">
        <div className="brand-mark">
          <UserRoundCheck />
        </div>
        <p className="eyebrow">Officer identity · {role.toUpperCase()}</p>
        <h1>Select your player</h1>
        <p>
          Choose your own in-game name from the alliance roster. This name will
          identify your changes and officer notes.
        </p>
        <label>
          Alliance member
          <NativeSelect
            autoFocus
            value={selected}
            onChange={(event) => setSelected(event.target.value)}
          >
            <option value="">Select your player…</option>
            {sorted.map((member) => (
              <option key={member.id} value={member.id}>
                {member.name} · {formatPower(member.totalPower)}
              </option>
            ))}
          </NativeSelect>
        </label>
        {player && (
          <div className="identity-preview">
            <UserRoundCheck />
            <span>
              <strong>{player.name}</strong>
              <small>
                {formatPower(player.totalPower)} · {role.toUpperCase()}
              </small>
            </span>
          </div>
        )}
        <Button disabled={!selected} onClick={() => onSelect(selected)}>
          Continue as {player?.name ?? "officer"}
        </Button>
        <Button variant="secondary" onClick={onLogout}>
          Back to login
        </Button>
        {!players.length && (
          <small>
            No alliance members are available. Add members to the shared roster
            before selecting an officer identity.
          </small>
        )}
        <div className="access-security">
          <Shield />
          <span>
            The selected name is used for attribution only. Editing permission
            still comes from your verified User ID.
          </span>
        </div>
      </section>
    </main>
  );
}

function AccessScreen({
  hasData,
  submitting,
  error,
  onLogin,
  onViewer,
}: {
  hasData: boolean;
  submitting: boolean;
  error: string | null;
  onLogin: (uid: string, remember: boolean) => Promise<void>;
  onViewer: () => void;
}) {
  const [uid, setUid] = useState(() => readAuth("kvi-cloud-user-uid") ?? "");
  const [remember, setRemember] = useState(
    () => readAuth("kvi-cloud-remember") !== "false",
  );
  return (
    <main className="access-screen">
      <section className="access-card">
        <div className="brand-mark">
          <Shield />
        </div>
        <p className="eyebrow">KVI · DARK WAR: SURVIVAL</p>
        <h1>Alliance War Room</h1>
        <p>
          Alliance members can sign in with their in-game User ID. R4 and R5 can
          edit shared plans; R1–R3 receive read-only access.
        </p>
        <label>
          User ID
          <Input
            autoFocus
            inputMode="numeric"
            value={uid}
            onChange={(event) => setUid(event.target.value.replace(/\D/g, ""))}
            placeholder="Enter your User ID"
          />
        </label>
        <label className="access-remember">
          <input
            type="checkbox"
            checked={remember}
            onChange={(event) => setRemember(event.target.checked)}
          />
          <span>
            <strong>Remember me</strong>
            <small>Keep this account signed in on this browser.</small>
          </span>
        </label>
        {error && <div className="access-error">{error}</div>}
        <Button
          disabled={submitting || uid.length < 8}
          onClick={() => void onLogin(uid, remember)}
        >
          <LogIn />
          {submitting ? "Signing in…" : "Alliance member login"}
        </Button>
        <Button
          variant="secondary"
          disabled={!hasData || submitting}
          onClick={onViewer}
        >
          View State as visitor
        </Button>
        {!hasData && (
          <small>
            State data has not been published yet. An R4 or R5 officer must
            initialize the shared plan.
          </small>
        )}
        <div className="access-security">
          <Shield />
          <span>
            Your User ID is used only to verify current alliance membership and
            rank. External visitors can access State data only.
          </span>
        </div>
      </section>
    </main>
  );
}

const ExportSheet = ({
  plan,
  players,
  ref,
}: {
  plan: NonNullable<ReturnType<typeof selectActivePlan>>;
  players: Player[];
  ref: React.Ref<HTMLDivElement>;
}) => (
  <div ref={ref} className="export-sheet">
    <header>
      <div className="brand-mark">
        <Shield />
      </div>
      <div>
        <small>KVI · DARK WAR: SURVIVAL · FRANKENSTEIN EVENT</small>
        <h1>{plan.name}</h1>
        <p>
          Estimated planning values · Exported {new Date().toLocaleString()}
        </p>
      </div>
    </header>
    <div className="export-rounds">
      {([1, 2] as RoundId[]).map((round) => (
        <section key={round}>
          <h2>
            Round {round}{" "}
            <small>{plan.roundTimes[round] || "Time not set"}</small>
          </h2>
          {plan.rounds[round].length ? (
            plan.rounds[round].map((r, index) => {
              const m = rallyMetrics(r, players);
              const leader = r.leader
                ? players.find((p) => p.id === r.leader!.playerId)
                : null;
              return (
                <article key={r.id}>
                  <div className="export-rally-head">
                    <strong>
                      0{index + 1} · {r.name}
                    </strong>
                    <b>{formatPower(m.power)} estimated</b>
                  </div>
                  <div className="export-leader">
                    <Crown />
                    <span>
                      <small>Rally leader</small>
                      <strong>
                        {leader?.name ?? "Not assigned"}
                        {r.leader ? ` · F${r.leader.formation}` : ""}
                      </strong>
                    </span>
                    <em>
                      {m.capacity == null
                        ? "Capacity unknown"
                        : `${formatPower(m.capacity)} rally capacity`}
                    </em>
                  </div>
                  <div className="export-members">
                    {r.participants.map((a) => {
                      const p = players.find((x) => x.id === a.playerId);
                      return p ? (
                        <div key={a.playerId}>
                          <span>{p.name}</span>
                          <small>
                            F{a.formation} ·{" "}
                            {formatPower(p.formations[a.formation].power)}
                          </small>
                        </div>
                      ) : null;
                    })}
                    {!r.participants.length && <p>No participants assigned</p>}
                  </div>
                </article>
              );
            })
          ) : (
            <p className="export-empty">No rallies planned</p>
          )}
        </section>
      ))}
    </div>
  </div>
);
