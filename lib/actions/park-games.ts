"use server";

/**
 * Loaders for the park-native game halls (components/park/games/*). Each mirrors what the old
 * flat /play/* page loaded — same queries, same gates (e.g. Invest stays parent-gated) — so the
 * games behave exactly as before, just inside Cucaino Park.
 */
import { createClient } from "@/lib/supabase/server";
import {
  getKid,
  listKids,
  getKidInvestingEnabled,
  ensureInvestAccount,
  ensureInvestLicence,
  listInvestHoldings,
  listInvestTransactions,
  getTodayRealPrices,
} from "@/lib/data/stub";
import { ensureDailyRealPrices } from "@/lib/invest/prices";
import { getCourseProgress } from "@/lib/actions/course";
import { getStoryProgress } from "@/lib/actions/stories";
import type { Kid } from "@/lib/domain/types";

export async function getArcadeInfo(kidId: string): Promise<{ sparks: number; stars: number } | null> {
  const kid = await getKid(kidId);
  return kid ? { sparks: kid.sparksBalance ?? 0, stars: kid.pointsBalance } : null;
}

export async function getMoneyTownKids(): Promise<Kid[]> {
  return listKids();
}

export async function getLearnProgress(kidId: string, courseId: string) {
  return getCourseProgress(kidId, courseId);
}

export async function getLibraryProgress(kidId: string) {
  return getStoryProgress(kidId);
}

export async function getBankData(kidId: string) {
  const kid = await getKid(kidId);
  if (!kid) return null;
  const enabled = await getKidInvestingEnabled(kid.id);
  if (!enabled) return { enabled: false as const };
  const supabase = await createClient();
  void ensureDailyRealPrices(supabase);
  const [account, licence, holdings, transactions, prices] = await Promise.all([
    ensureInvestAccount(kid.id),
    ensureInvestLicence(kid.id),
    listInvestHoldings(kid.id),
    listInvestTransactions(kid.id, 30),
    getTodayRealPrices(),
  ]);
  return {
    enabled: true as const,
    kid: { id: kid.id, name: kid.name, cashBalance: kid.cashBalance },
    account,
    licence,
    holdings,
    transactions,
    prices,
  };
}
