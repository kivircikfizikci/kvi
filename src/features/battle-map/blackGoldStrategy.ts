import type { BlackGoldAssignment, BlackGoldParticipant, BlackGoldTeam } from "../../types";
import { BLACK_GOLD_OBJECTIVES, BGB_GRID_SIZE, type BlackGoldPoint, validateBlackGoldPosition } from "./blackGoldGeometry";

export const BGB_PLAN_END = 30;
export const BGB_DEFAULT_TIMING = { buildings: 5, firstBall: 15, secondBall: 25, end: BGB_PLAN_END };
export const BGB_PHASES = [
  { minute: 0, name: "Opening", instruction: "Move to your opening coordinates and hold your refinery." },
  { minute: 5, name: "Key Buildings", instruction: "Capture or support your assigned building when it unlocks." },
  { minute: 12, name: "First Ball Prep", instruction: "Center crew regroups at the Alloy Factory by 13:00. Other players hold their objectives." },
  { minute: 15, name: "First Gold Ball", instruction: "When the ball spawns, center crew secures and escorts it to your HQ." },
  { minute: 17, name: "Control & Pressure", instruction: "Return to your objectives and reinforce contested buildings." },
  { minute: 22, name: "Second Ball Prep", instruction: "Center crew regroups at the Alloy Factory by 23:00. Other players hold their objectives." },
  { minute: 25, name: "Second Gold Ball", instruction: "When the ball spawns, center crew escorts it to HQ. Secure objectives through the finish." },
] as const;

const refineryPrefix = "oil-refinery-";
const refineryOrder = ["north-west", "west", "north-east", "east", "south-west", "south-east"];
const squadColors = ["#f5b462", "#67d4c3", "#a7abff", "#f78b9a", "#8fd995", "#76c3f5"];
const opposite: Record<string, string> = {
  "north-west": "south-east", west: "east", "north-east": "south-west",
  east: "west", "south-west": "north-east", "south-east": "north-west",
  north: "south", south: "north",
};
const buildingJobs = [
  ["military-center-north-west", "Capture"],
  ["military-center-north-west", "Support"],
  ["field-hospital-north", "Capture"],
  ["field-hospital-north", "Support"],
  ["field-hospital-south", "Capture"],
  ["military-center-south-east", "Capture"],
] as const;
const objectives = new Map(BLACK_GOLD_OBJECTIVES.map(value => [value.id, value]));
const pointOf = (item: BlackGoldParticipant): BlackGoldPoint | undefined =>
  item.x === undefined || item.y === undefined ? undefined : { x: item.x, y: item.y };
const objectiveName = (id: string) => {
  const direction = id.replace(/^(oil-refinery-|field-hospital-|military-center-)/, "")
    .split("-").map(part => part[0].toUpperCase() + part.slice(1)).join("-");
  const name = objectives.get(id)?.name.replace("Military Center", "Military Base") ?? "";
  return `${direction} ${name}`;
};
const oppositeBuilding = (id: string) => {
  const prefix = id.startsWith("field-hospital-") ? "field-hospital-" : "military-center-";
  return prefix + opposite[id.slice(prefix.length)];
};

export const formatBgbMinute = (minute: number) => `${String(minute).padStart(2, "0")}:00`;
export function validateBgbTiming(timing: typeof BGB_DEFAULT_TIMING) {
  return Object.values(timing).every(Number.isInteger) &&
    timing.buildings >= 1 && timing.buildings < timing.firstBall - 3 &&
    timing.firstBall + 2 < timing.secondBall - 3 &&
    timing.secondBall < timing.end && timing.end <= 90;
}

export function bgbPhases(timing = BGB_DEFAULT_TIMING) {
  const { buildings, firstBall, secondBall } = timing;
  const minutes = [0, buildings, firstBall - 3, firstBall, firstBall + 2, secondBall - 3, secondBall];
  return BGB_PHASES.map((phase, index) => ({
    ...phase,
    index,
    minute: minutes[index],
    instruction: index === 2 ? phase.instruction.replace("13:00", formatBgbMinute(firstBall - 2))
      : index === 5 ? phase.instruction.replace("23:00", formatBgbMinute(secondBall - 2))
      : phase.instruction,
  }));
}

function findPlot(
  center: BlackGoldPoint, toward: BlackGoldPoint, placed: BlackGoldParticipant[],
): BlackGoldPoint | undefined {
  const best = { x: center.x + Math.sign(toward.x - center.x) * 5, y: center.y + Math.sign(toward.y - center.y) * 5 };
  for (const radius of [9, 18, BGB_GRID_SIZE]) {
    let nearest: BlackGoldPoint | undefined;
    let nearestDistance = Infinity;
    for (let y = Math.max(1, center.y - radius); y <= Math.min(BGB_GRID_SIZE - 2, center.y + radius); y++) {
      for (let x = Math.max(1, center.x - radius); x <= Math.min(BGB_GRID_SIZE - 2, center.x + radius); x++) {
        const distance = (x - best.x) ** 2 + (y - best.y) ** 2;
        if (distance < nearestDistance && !validateBlackGoldPosition(x, y, placed)) {
          nearest = { x, y };
          nearestDistance = distance;
        }
      }
    }
    if (nearest) return nearest;
  }
}

export function generateBlackGoldOpening(team: BlackGoldTeam, power: (participant: BlackGoldParticipant) => number) {
  const active = team.participants.filter(item => item.role === "active");
  const red = team.side !== "blue";
  const hq = objectives.get(red ? "headquarters-south-west" : "headquarters-north-east")!;
  const squads = refineryOrder.map((direction, index) => ({
    id: refineryPrefix + (red ? direction : opposite[direction]),
    color: squadColors[index],
    job: buildingJobs[index],
    members: [] as BlackGoldParticipant[],
    power: 0,
  }));
  const occupied: BlackGoldParticipant[] = [];
  const ranked = [...active].sort((a, b) => power(b) - power(a) || a.id.localeCompare(b.id));
  const capacity = Math.ceil(active.length / squads.length);

  function addToSquad(squad: typeof squads[number], item: BlackGoldParticipant) {
    squad.members.push(item);
    squad.power += power(item);
  }

  for (const item of ranked) {
    const point = item.positionLocked && pointOf(item);
    if (!point) continue;
    if (validateBlackGoldPosition(point.x, point.y, occupied)) {
      throw new Error(`The locked position for ${item.name} overlaps another plot or objective.`);
    }
    occupied.push(item);
    const distance = (id: string) => {
      const target = objectives.get(id)!;
      return (target.x - point.x) ** 2 + (target.y - point.y) ** 2;
    };
    const nearest = [...squads].sort((a, b) => distance(a.id) - distance(b.id))[0];
    addToSquad(nearest, item);
  }

  for (const item of ranked.filter(player => !occupied.some(locked => locked.id === player.id))) {
    const available = squads.filter(squad => squad.members.length < capacity);
    const target = [...(available.length ? available : squads)].sort(
      (a, b) => Number(Boolean(a.members.length)) - Number(Boolean(b.members.length)) ||
        a.power - b.power || a.members.length - b.members.length,
    )[0];
    const plot = findPlot(objectives.get(target.id)!, hq, occupied);
    if (!plot) throw new Error(`No opening plot was available for ${item.name}.`);
    const placed = { ...item, ...plot };
    occupied.push(placed);
    addToSquad(target, placed);
  }

  const assignments = squads.flatMap(squad => {
    const group = [...squad.members].sort((a, b) => power(b) - power(a) || a.id.localeCompare(b.id));
    const [building, action] = squad.job;
    const buildingId = red ? building : oppositeBuilding(building);
    return group.map((item, index): BlackGoldAssignment => ({
      participantId: item.id,
      refineryId: squad.id,
      centerCrew: index === 0 && group.length >= 2,
      ...(index === (group.length >= 3 ? 1 : 0) && group.length >= 2
        ? { buildingId, buildingAction: action }
        : {}),
      ...(building === "field-hospital-south" && group.length >= 4 && index === 2
        ? { buildingId: red ? "military-center-south-east" : "military-center-north-west", buildingAction: "Support" }
        : {}),
    }));
  });
  const byId = new Map(squads.flatMap(squad => squad.members.map(item => [
    item.id, { ...item, color: squad.color },
  ] as const)));
  return { participants: team.participants.map(item => byId.get(item.id) ?? item), strategy: assignments };
}

export interface BlackGoldPlanRow {
  slot: BlackGoldParticipant;
  occupant: BlackGoldParticipant;
  point?: BlackGoldPoint;
  route?: { from: BlackGoldPoint; to: BlackGoldPoint };
  task: string;
}

function placementsAt(team: BlackGoldTeam, minute: number) {
  const active = team.participants.filter(item => item.role === "active");
  const hq = objectives.get(team.side === "blue" ? "headquarters-north-east" : "headquarters-south-west")!;
  const jobs = new Map(team.strategy?.map(item => [item.participantId, item]));
  const { buildings, firstBall, secondBall } = team.timing ?? BGB_DEFAULT_TIMING;
  const center = (minute >= firstBall - 3 && minute < firstBall + 2) || minute >= secondBall - 3;
  const ball = (minute >= firstBall && minute < firstBall + 2) || minute >= secondBall;
  const orders = active.map(slot => {
    const job = jobs.get(slot.id);
    if (!job || !pointOf(slot)) return { slot, task: "No tactical assignment" };
    const hold = `Hold ${objectiveName(job.refineryId)}`;
    if (center && job.centerCrew) {
      return {
        slot,
        target: objectives.get("golden-ball"),
        task: ball ? "Secure the Gold Ball and escort it to HQ on spawn" : `Regroup at Alloy Factory by ${formatBgbMinute((minute < firstBall + 2 ? firstBall : secondBall) - 2)}`,
      };
    }
    if (minute >= buildings && job.buildingId) {
      return {
        slot,
        target: objectives.get(job.buildingId),
        task: `${minute < firstBall - 3 ? job.buildingAction : "Hold or reinforce"} ${objectiveName(job.buildingId)}${minute < firstBall - 3 ? " on unlock" : ""}`,
      };
    }
    return { slot, task: hold };
  });
  const placed = orders.filter(order => !order.target).map(order => order.slot);
  const result = new Map<string, { point?: BlackGoldPoint; task: string }>();
  for (const order of orders) {
    const plot = order.target ? findPlot(order.target, hq, placed) : undefined;
    if (plot) placed.push({ ...order.slot, ...plot });
    result.set(order.slot.id, { point: plot ?? pointOf(order.slot), task: order.task });
  }
  return result;
}

export function blackGoldPlanAt(team: BlackGoldTeam, minute: number): BlackGoldPlanRow[] {
  const phases = bgbPhases(team.timing);
  const phase = [...phases].reverse().find(item => item.minute <= minute) ?? phases[0];
  const current = placementsAt(team, phase.minute);
  const previous = phase.minute ? placementsAt(team, phase.minute - 1) : current;
  const members = new Map(team.participants.map(item => [item.id, item]));
  return team.participants.filter(item => item.role === "active").map(slot => {
    const substitutions = team.substitutions?.filter(change => change.slotId === slot.id && change.minute <= minute) ?? [];
    const replacement = substitutions.reduce<typeof substitutions[number] | undefined>(
      (latest, change) => !latest || change.minute >= latest.minute ? change : latest, undefined,
    );
    const order = current.get(slot.id)!;
    const before = previous.get(slot.id)?.point;
    const after = order.point;
    const moved = before && after && (before.x !== after.x || before.y !== after.y);
    const ballPhase = phase.index === 3 || phase.index === 6;
    const hq = objectives.get(team.side === "blue" ? "headquarters-north-east" : "headquarters-south-west")!;
    return {
      slot,
      occupant: (replacement && members.get(replacement.reserveId)) || slot,
      ...order,
      route: ballPhase && order.task.startsWith("Secure") && after
        ? { from: after, to: { x: hq.x, y: hq.y } }
        : moved ? { from: before, to: after } : undefined,
    };
  });
}

export function reserveOptions(team: BlackGoldTeam) {
  const used = new Set(team.substitutions?.map(change => change.reserveId));
  return team.participants.filter(item => item.role === "reserve" && !used.has(item.id));
}

export function replaceBlackGoldPlayer(team: BlackGoldTeam, slotId: string, reserveId: string, minute: number): BlackGoldTeam {
  if (!Number.isInteger(minute) || minute < 0 || minute > (team.timing?.end ?? BGB_PLAN_END)) throw new Error("Invalid match minute.");
  if (!team.participants.some(item => item.id === slotId && item.role === "active")) throw new Error("Choose an active roster slot.");
  if (!reserveOptions(team).some(item => item.id === reserveId)) throw new Error("Choose an available reserve from this team.");
  if (team.substitutions?.some(change => change.slotId === slotId && change.minute > minute)) {
    throw new Error("This slot already has a later replacement. Select that minute or a later one.");
  }
  return { ...team, substitutions: [...(team.substitutions ?? []), { slotId, reserveId, minute }] };
}
