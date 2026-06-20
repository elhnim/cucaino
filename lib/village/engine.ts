// Village Pillage — pure engine, ported directly from the game spec.
// 2-player simultaneous reveal: each player commits one card Left + one Right.
// No I/O — safe to unit test and to run on the host client.

import {
  BASE,
  type CardId,
  DEF,
  MARKET_SIZE,
  MERC_COST,
  MERCS,
  RELIC_COST,
  START_BANK,
  START_TURNIPS,
  WIN_RELICS,
} from "./config";

export interface PlayerState {
  turnips: number;
  bank: number;
  relics: number;
  hand: CardId[];
}

export interface Picks {
  l: CardId;
  r: CardId;
}

export interface ResolutionDetail {
  picks: Record<string, Picks>;
  delta: Record<string, number>; // wealth change this round, per member
  duels: Array<{ leftId: string; leftCard: CardId; rightId: string; rightCard: CardId }>;
}

export interface VillageGame {
  players: Record<string, PlayerState>;
  order: [string, string]; // [hostId, guestId] — stable A/B mapping
  round: number;
  market: CardId[];
  deck: CardId[];
  submitted: Record<string, boolean>;          // public sentinels (set by the secret RPC)
  reveal: Record<string, Picks> | null;        // both picks, exposed only once both submitted
  resolved: boolean;                            // host has applied the resolution
  resolution: ResolutionDetail | null;
  shopPending: Record<string, boolean>;
  shopChoice: Record<string, string>;          // member -> 'relic' | 'skip' | mercId
  winner: string | null;
}

// ---- helpers (ported) ----------------------------------------------------
const isAttacker = (c: CardId) => DEF[c].kind === "attacker";
const raidAmt = (c: CardId) => DEF[c].raid || 0;
const mercCount = (hand: CardId[]) => hand.filter((c) => MERC_COST[c] != null).length;

// Spy mimics the card it faces (two spies → both act as Farmer).
const eff = (card: CardId, opp: CardId): CardId => (card !== "spy" ? card : opp === "spy" ? "farmer" : opp);

function attackerSucceeds(att: CardId, oppEff: CardId): boolean {
  const o = DEF[oppEff];
  if (o.kind === "blocker") return !!(DEF[att].ignoreWall && o.wall); // siege bypasses walls/barns
  if (o.kind === "attacker") return false; // attackers clash
  if (o.immune) return false; // wizard/pirate/monk can't be robbed
  return true; // producers & mystic are exposed
}

function prod(card: CardId, oppEff: CardId, hand: CardId[]): number {
  const d = DEF[card];
  if (d.kind === "blocker") return d.wall ? (DEF[oppEff].kind === "attacker" ? 0 : d.produce || 0) : d.produce || 0;
  if (d.kind === "producer") {
    let n = d.produce || 0;
    if (d.perMerc) n += Math.min(3, mercCount(hand));
    return n;
  }
  return 0;
}

interface Side { S: number; Bk: number }

function applyAttacks(pairs: Array<[CardId, CardId]>, attacker: Side, victim: Side) {
  for (const [att, opp] of pairs) {
    if (!isAttacker(att)) continue;
    if (!attackerSucceeds(att, opp)) {
      if (DEF[att].reckless) attacker.S = Math.max(0, attacker.S - 1);
      continue;
    }
    let amt = raidAmt(att);
    if (att === "necromancer" && DEF[opp].kind === "producer") amt += 1;
    if (DEF[opp].juicy) amt += 1;
    if (att === "pirate" && opp === "mystic") amt += 1;
    const got = Math.min(amt, victim.S);
    victim.S -= got;
    attacker.S += got;
    if (DEF[att].sabotage) victim.Bk = Math.max(0, victim.Bk - 1);
  }
}

// ---- economy helpers ------------------------------------------------------
export const wealth = (p: PlayerState) => p.turnips + p.bank;
export function spend(p: PlayerState, n: number) {
  const fromS = Math.min(n, p.turnips);
  p.turnips -= fromS;
  p.bank -= n - fromS;
}
export const canShop = (p: PlayerState, market: CardId[]) =>
  wealth(p) >= RELIC_COST || market.some((m) => (MERC_COST[m] ?? Infinity) <= wealth(p));

export function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ---- setup ---------------------------------------------------------------
export function initGame(hostId: string, guestId: string): VillageGame {
  const shuffled = shuffle(MERCS);
  const newPlayer = (): PlayerState => ({ turnips: START_TURNIPS, bank: START_BANK, relics: 0, hand: [...BASE] });
  return {
    players: { [hostId]: newPlayer(), [guestId]: newPlayer() },
    order: [hostId, guestId],
    round: 1,
    market: shuffled.slice(0, MARKET_SIZE),
    deck: shuffled.slice(MARKET_SIZE),
    submitted: {},
    reveal: null,
    resolved: false,
    resolution: null,
    shopPending: {},
    shopChoice: {},
    winner: null,
  };
}

// ---- resolution ----------------------------------------------------------
export function resolveRound(game: VillageGame): VillageGame {
  if (!game.reveal) return game;
  const [aId, bId] = game.order;
  const A = game.players[aId];
  const B = game.players[bId];
  const ap = game.reveal[aId];
  const bp = game.reveal[bId];

  const a: Side = { S: A.turnips, Bk: A.bank };
  const b: Side = { S: B.turnips, Bk: B.bank };

  const aL = eff(ap.l, bp.r), aR = eff(ap.r, bp.l), bR = eff(bp.r, ap.l), bL = eff(bp.l, ap.r);

  // 1) production
  a.S += prod(aL, bp.r, A.hand) + prod(aR, bp.l, A.hand);
  b.S += prod(bR, ap.l, B.hand) + prod(bL, ap.r, B.hand);

  // 2) banking (Barn 3 / Monk 2) — supply → bank, protected this round
  const aBank = Math.min((DEF[ap.l].bank || 0) + (DEF[ap.r].bank || 0), a.S);
  a.S -= aBank;
  a.Bk += aBank;
  const bBank = Math.min((DEF[bp.l].bank || 0) + (DEF[bp.r].bank || 0), b.S);
  b.S -= bBank;
  b.Bk += bBank;

  // 3) steals — A.left faces B.right ; A.right faces B.left
  applyAttacks([[aL, bR], [aR, bL]], a, b);
  applyAttacks([[bR, aL], [bL, aR]], b, a);

  const players: Record<string, PlayerState> = {
    ...game.players,
    [aId]: { ...A, turnips: a.S, bank: a.Bk },
    [bId]: { ...B, turnips: b.S, bank: b.Bk },
  };

  const resolution: ResolutionDetail = {
    picks: { [aId]: ap, [bId]: bp },
    delta: {
      [aId]: a.S + a.Bk - (A.turnips + A.bank),
      [bId]: b.S + b.Bk - (B.turnips + B.bank),
    },
    duels: [
      { leftId: aId, leftCard: ap.l, rightId: bId, rightCard: bp.r },
      { leftId: aId, leftCard: ap.r, rightId: bId, rightCard: bp.l },
    ],
  };

  const playedMystic = (p: Picks) => p.l === "mystic" || p.r === "mystic";
  const shopPending: Record<string, boolean> = {};
  if (playedMystic(ap) && canShop(players[aId], game.market)) shopPending[aId] = true;
  if (playedMystic(bp) && canShop(players[bId], game.market)) shopPending[bId] = true;

  return { ...game, players, resolved: true, resolution, shopPending };
}

// ---- shop ----------------------------------------------------------------
export function applyPurchase(game: VillageGame, memberId: string, choice: string): VillageGame {
  const p: PlayerState = { ...game.players[memberId] };
  let market = [...game.market];
  const deck = [...game.deck];

  if (choice === "relic") {
    if (wealth(p) >= RELIC_COST) {
      spend(p, RELIC_COST);
      p.relics += 1;
    }
  } else if (choice === "skip") {
    // nothing
  } else if (MERC_COST[choice as CardId] != null && market.includes(choice as CardId)) {
    const cost = MERC_COST[choice as CardId]!;
    if (wealth(p) >= cost) {
      spend(p, cost);
      p.hand = [...p.hand, choice as CardId];
      const idx = market.indexOf(choice as CardId);
      market = market.filter((_, i) => i !== idx);
      if (deck.length) market.splice(idx, 0, deck.shift()!);
    }
  }

  const players = { ...game.players, [memberId]: p };
  const shopPending = { ...game.shopPending };
  delete shopPending[memberId];
  const shopChoice = { ...game.shopChoice };
  delete shopChoice[memberId];
  const winner = p.relics >= WIN_RELICS ? memberId : game.winner;

  return { ...game, players, market, deck, shopPending, shopChoice, winner };
}

// ---- next round ----------------------------------------------------------
export function nextRound(game: VillageGame): VillageGame {
  return {
    ...game,
    round: game.round + 1,
    submitted: {},
    reveal: null,
    resolved: false,
    resolution: null,
    shopPending: {},
    shopChoice: {},
  };
}
