// Village Pillage — pure game engine. No I/O, safe to unit test.
//
// Each round every player secretly picks one card. Attack cards (bandit,
// catapult) also pick a target. resolveRound() takes the full move map and
// returns the next state plus a Resolution describing what happened (for the
// reveal animation and the round log).

import {
  BANDIT_STASH_STEAL,
  CATAPULT_STEAL,
  type CardId,
  FARM_YIELD,
  GOAL,
  GRANNY_BONUS,
  GRANNY_COUNTER,
  MAX_ROUNDS,
  START_TURNIPS,
  WALL_BONUS,
} from "./config";

export interface VillagePlayer {
  id: string;
  name: string;
  avatar: string;
  turnips: number;
}

export interface Move {
  card: CardId;
  targetId?: string | null;
}

export interface ResolutionEvent {
  emoji: string;
  text: string;
  actorId: string;
}

export interface Resolution {
  round: number;
  moves: Record<string, Move>;
  deltas: Record<string, number>;
  events: ResolutionEvent[];
}

export interface VillageState {
  players: VillagePlayer[];
  round: number;
  goal: number;
  maxRounds: number;
  /** Hidden card choices for the round in progress, keyed by player id. */
  pending: Record<string, Move>;
  lastResolution: Resolution | null;
  winnerIds: string[] | null;
}

export function initState(players: VillagePlayer[]): VillageState {
  return {
    players: players.map((p) => ({ ...p, turnips: START_TURNIPS })),
    round: 1,
    goal: GOAL,
    maxRounds: MAX_ROUNDS,
    pending: {},
    lastResolution: null,
    winnerIds: null,
  };
}

export function resolveRound(state: VillageState, moves: Record<string, Move>): VillageState {
  const players = state.players;
  const nameOf = (id: string) => players.find((p) => p.id === id)?.name ?? "Someone";
  const cardOf = (id: string) => moves[id]?.card;
  const targetOf = (id: string) => moves[id]?.targetId ?? null;
  const isValidTarget = (t: string | null) => !!t && players.some((p) => p.id === t);

  const delta: Record<string, number> = {};
  players.forEach((p) => (delta[p.id] = 0));
  const events: ResolutionEvent[] = [];
  const robbedFarmers = new Set<string>();
  const attacked = new Set<string>();

  // Bandits
  players.forEach((a) => {
    if (cardOf(a.id) !== "bandit") return;
    const t = targetOf(a.id);
    if (!isValidTarget(t)) {
      events.push({ emoji: "🦹", text: `${nameOf(a.id)}'s bandit found no one to rob.`, actorId: a.id });
      return;
    }
    attacked.add(t!);
    const tc = cardOf(t!);
    if (tc === "wall") {
      events.push({ emoji: "🧱", text: `${nameOf(t!)}'s wall blocked ${nameOf(a.id)}'s bandit!`, actorId: a.id });
    } else if (tc === "granny") {
      delta[a.id] -= GRANNY_COUNTER;
      delta[t!] += GRANNY_COUNTER;
      events.push({ emoji: "👵", text: `${nameOf(t!)}'s granny chased off ${nameOf(a.id)}'s bandit and grabbed ${GRANNY_COUNTER}!`, actorId: t! });
    } else if (tc === "farmer") {
      robbedFarmers.add(t!);
      delta[a.id] += FARM_YIELD;
      events.push({ emoji: "🦹", text: `${nameOf(a.id)} robbed ${nameOf(t!)}'s harvest (+${FARM_YIELD})!`, actorId: a.id });
    } else {
      delta[a.id] += BANDIT_STASH_STEAL;
      delta[t!] -= BANDIT_STASH_STEAL;
      events.push({ emoji: "🦹", text: `${nameOf(a.id)} pickpocketed ${BANDIT_STASH_STEAL} from ${nameOf(t!)}.`, actorId: a.id });
    }
  });

  // Catapults
  players.forEach((a) => {
    if (cardOf(a.id) !== "catapult") return;
    const t = targetOf(a.id);
    if (!isValidTarget(t)) {
      events.push({ emoji: "🎯", text: `${nameOf(a.id)}'s catapult misfired.`, actorId: a.id });
      return;
    }
    attacked.add(t!);
    const tc = cardOf(t!);
    if (tc === "wall") {
      delta[a.id] += CATAPULT_STEAL;
      delta[t!] -= CATAPULT_STEAL;
      events.push({ emoji: "🎯", text: `${nameOf(a.id)}'s catapult smashed ${nameOf(t!)}'s wall and stole ${CATAPULT_STEAL}!`, actorId: a.id });
    } else if (tc === "granny") {
      delta[a.id] -= GRANNY_COUNTER;
      delta[t!] += GRANNY_COUNTER;
      events.push({ emoji: "👵", text: `${nameOf(t!)}'s granny wrecked ${nameOf(a.id)}'s catapult and grabbed ${GRANNY_COUNTER}!`, actorId: t! });
    } else {
      events.push({ emoji: "💨", text: `${nameOf(a.id)}'s catapult whiffed — no wall to smash.`, actorId: a.id });
    }
  });

  // Farmers harvest (unless robbed)
  players.forEach((p) => {
    if (cardOf(p.id) !== "farmer") return;
    if (robbedFarmers.has(p.id)) {
      events.push({ emoji: "😱", text: `${nameOf(p.id)}'s harvest was stolen!`, actorId: p.id });
    } else {
      delta[p.id] += FARM_YIELD;
      events.push({ emoji: "🌾", text: `${nameOf(p.id)} harvested ${FARM_YIELD} turnips.`, actorId: p.id });
    }
  });

  // Turtle bonuses for unattacked walls / grannies
  players.forEach((p) => {
    const c = cardOf(p.id);
    if (c === "wall" && !attacked.has(p.id)) {
      delta[p.id] += WALL_BONUS;
      events.push({ emoji: "🧱", text: `${nameOf(p.id)} fortified safely (+${WALL_BONUS}).`, actorId: p.id });
    }
    if (c === "granny" && !attacked.has(p.id)) {
      delta[p.id] += GRANNY_BONUS;
      events.push({ emoji: "🥧", text: `${nameOf(p.id)}'s granny baked pies (+${GRANNY_BONUS}).`, actorId: p.id });
    }
  });

  const newPlayers = players.map((p) => ({
    ...p,
    turnips: Math.max(0, p.turnips + (delta[p.id] || 0)),
  }));

  const playedRound = state.round;
  const maxTurnips = Math.max(...newPlayers.map((p) => p.turnips));
  const finished = maxTurnips >= state.goal || playedRound >= state.maxRounds;
  const winnerIds = finished ? newPlayers.filter((p) => p.turnips === maxTurnips).map((p) => p.id) : null;

  return {
    ...state,
    players: newPlayers,
    round: finished ? playedRound : playedRound + 1,
    pending: {},
    lastResolution: { round: playedRound, moves, deltas: delta, events },
    winnerIds,
  };
}
