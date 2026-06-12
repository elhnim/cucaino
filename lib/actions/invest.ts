"use server";

import { revalidatePath } from "next/cache";
import { logCashTransaction, type ActionResult } from "@/lib/actions/cash";
import { createClient } from "@/lib/supabase/server";
import { ensureInvestAccount, ensureInvestLicence } from "@/lib/data/queries";
import { getAsset, MIN_TRADE_CENTS } from "@/lib/invest/assets";
import {
  isDust,
  newAvgCostCents,
  proceedsCents,
  quantityForAmount,
  sellQuantityForAmount,
} from "@/lib/invest/math";
import { LICENCE_PASS_THRESHOLD, LICENCE_QUIZ, SMART_INVESTOR_SPARKS } from "@/lib/invest/learn";

async function fetchKidForWrite(kidId: string): Promise<{
  family_id: string;
  cash_balance: number;
  investing_enabled: boolean;
  sparks_balance: number;
} | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("kids")
    .select("family_id, cash_balance, investing_enabled, sparks_balance")
    .eq("id", kidId)
    .maybeSingle();
  return data as any;
}

async function fetchLatestPriceCents(symbol: string): Promise<number | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("real_asset_prices")
    .select("price_cents")
    .eq("symbol", symbol)
    .order("price_date", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data ? Number((data as any).price_cents) : null;
}

async function requireEnabled(kidId: string) {
  const kid = await fetchKidForWrite(kidId);
  if (!kid) return { ok: false as const, error: "Kid not found." };
  if (!kid.investing_enabled) return { ok: false as const, error: "Invest is locked by a parent." };
  return { ok: true as const, kid };
}

export async function depositToInvest(kidId: string, amountCents: number): Promise<ActionResult> {
  if (!Number.isInteger(amountCents) || amountCents < MIN_TRADE_CENTS) return { ok: false, error: "Minimum deposit is $0.50." };
  const enabled = await requireEnabled(kidId);
  if (!enabled.ok) return enabled;
  if (enabled.kid.cash_balance < amountCents) return { ok: false, error: "Not enough cash." };

  const supabase = await createClient();
  const account = await ensureInvestAccount(kidId);
  const { error: accountErr } = await supabase
    .from("invest_accounts")
    .update({
      cash_cents: account.cashCents + amountCents,
      total_deposited_cents: account.totalDepositedCents + amountCents,
      updated_at: new Date().toISOString(),
    })
    .eq("kid_id", kidId);
  if (accountErr) return { ok: false, error: "Failed to update Invest account." };

  const cash = await logCashTransaction(kidId, amountCents, "Invest deposit", "debit");
  if (!cash.ok) return cash;

  await supabase.from("invest_transactions").insert({
    family_id: enabled.kid.family_id,
    kid_id: kidId,
    type: "deposit",
    total_cents: amountCents,
  });

  revalidatePath("/play/invest");
  revalidatePath(`/kid/${kidId}/home`);
  return { ok: true };
}

export async function withdrawFromInvest(kidId: string, amountCents: number): Promise<ActionResult> {
  if (!Number.isInteger(amountCents) || amountCents < MIN_TRADE_CENTS) return { ok: false, error: "Minimum withdrawal is $0.50." };
  const enabled = await requireEnabled(kidId);
  if (!enabled.ok) return enabled;

  const supabase = await createClient();
  const account = await ensureInvestAccount(kidId);
  if (account.cashCents < amountCents) return { ok: false, error: "Not enough cash in Invest." };

  const { error: accountErr } = await supabase
    .from("invest_accounts")
    .update({
      cash_cents: account.cashCents - amountCents,
      total_withdrawn_cents: account.totalWithdrawnCents + amountCents,
      updated_at: new Date().toISOString(),
    })
    .eq("kid_id", kidId);
  if (accountErr) return { ok: false, error: "Failed to update Invest account." };

  const cash = await logCashTransaction(kidId, amountCents, "Invest withdrawal", "credit");
  if (!cash.ok) return cash;

  await supabase.from("invest_transactions").insert({
    family_id: enabled.kid.family_id,
    kid_id: kidId,
    type: "withdraw",
    total_cents: amountCents,
  });

  revalidatePath("/play/invest");
  revalidatePath(`/kid/${kidId}/home`);
  return { ok: true };
}

export async function buyAsset(kidId: string, symbol: string, amountCents: number): Promise<ActionResult> {
  if (!Number.isInteger(amountCents) || amountCents < MIN_TRADE_CENTS) return { ok: false, error: "Minimum buy is $0.50." };
  const asset = getAsset(symbol);
  if (!asset) return { ok: false, error: "Unknown asset." };
  const enabled = await requireEnabled(kidId);
  if (!enabled.ok) return enabled;

  const licence = await ensureInvestLicence(kidId);
  if (!licence.passedAt) return { ok: false, error: "Earn your Investor Licence before buying." };

  const priceCents = await fetchLatestPriceCents(symbol);
  if (!priceCents) return { ok: false, error: "Price not available yet. Try again soon." };

  const supabase = await createClient();
  const account = await ensureInvestAccount(kidId);
  if (account.cashCents < amountCents) return { ok: false, error: "Not enough Invest cash." };

  const qty = quantityForAmount(amountCents, priceCents);
  const { data: existing } = await supabase
    .from("invest_holdings")
    .select("quantity, avg_cost_cents")
    .eq("kid_id", kidId)
    .eq("asset_symbol", symbol)
    .maybeSingle();
  const oldQty = existing ? Number((existing as any).quantity) : 0;
  const oldAvg = existing ? Number((existing as any).avg_cost_cents) : 0;
  const newQty = oldQty + qty;

  const { error: holdingErr } = await supabase.from("invest_holdings").upsert(
    {
      kid_id: kidId,
      family_id: enabled.kid.family_id,
      asset_symbol: symbol,
      quantity: newQty,
      avg_cost_cents: newAvgCostCents(oldQty, oldAvg, qty, priceCents),
      updated_at: new Date().toISOString(),
    },
    { onConflict: "kid_id,asset_symbol" },
  );
  if (holdingErr) return { ok: false, error: "Failed to update holding." };

  const { error: accountErr } = await supabase
    .from("invest_accounts")
    .update({ cash_cents: account.cashCents - amountCents, updated_at: new Date().toISOString() })
    .eq("kid_id", kidId);
  if (accountErr) return { ok: false, error: "Failed to update Invest cash." };

  await supabase.from("invest_transactions").insert({
    family_id: enabled.kid.family_id,
    kid_id: kidId,
    type: "buy",
    asset_symbol: symbol,
    quantity: qty,
    price_cents: priceCents,
    total_cents: amountCents,
  });

  revalidatePath("/play/invest");
  return { ok: true };
}

export async function sellAsset(
  kidId: string,
  symbol: string,
  opts: { amountCents?: number; all?: boolean },
): Promise<ActionResult> {
  const asset = getAsset(symbol);
  if (!asset) return { ok: false, error: "Unknown asset." };
  const enabled = await requireEnabled(kidId);
  if (!enabled.ok) return enabled;

  const priceCents = await fetchLatestPriceCents(symbol);
  if (!priceCents) return { ok: false, error: "Price not available yet. Try again soon." };
  if (!opts.all && (!opts.amountCents || opts.amountCents < MIN_TRADE_CENTS)) return { ok: false, error: "Minimum sell is $0.50." };

  const supabase = await createClient();
  const [{ data: holding }, account] = await Promise.all([
    supabase.from("invest_holdings").select("id, quantity").eq("kid_id", kidId).eq("asset_symbol", symbol).maybeSingle(),
    ensureInvestAccount(kidId),
  ]);
  if (!holding) return { ok: false, error: "You do not own this asset." };

  const ownedQty = Number((holding as any).quantity);
  const sellQty = opts.all ? ownedQty : sellQuantityForAmount(opts.amountCents ?? 0, priceCents, ownedQty);
  if (sellQty <= 0 || sellQty > ownedQty) return { ok: false, error: "Not enough of this asset to sell." };
  const proceeds = proceedsCents(sellQty, priceCents);
  const remaining = ownedQty - sellQty;

  const holdingErr = isDust(remaining, priceCents)
    ? (await supabase.from("invest_holdings").delete().eq("id", (holding as any).id)).error
    : (await supabase.from("invest_holdings").update({ quantity: remaining, updated_at: new Date().toISOString() }).eq("id", (holding as any).id)).error;
  if (holdingErr) return { ok: false, error: "Failed to update holding." };

  const { error: accountErr } = await supabase
    .from("invest_accounts")
    .update({ cash_cents: account.cashCents + proceeds, updated_at: new Date().toISOString() })
    .eq("kid_id", kidId);
  if (accountErr) return { ok: false, error: "Failed to update Invest cash." };

  await supabase.from("invest_transactions").insert({
    family_id: enabled.kid.family_id,
    kid_id: kidId,
    type: "sell",
    asset_symbol: symbol,
    quantity: sellQty,
    price_cents: priceCents,
    total_cents: proceeds,
  });

  revalidatePath("/play/invest");
  return { ok: true };
}

/** Up to 30 days of saved daily prices for one symbol (oldest data wins the chart). */
export async function loadPriceHistory(symbol: string) {
  const { getRealPriceHistory } = await import("@/lib/data/queries");
  return getRealPriceHistory(symbol, 30);
}

export async function completeLesson(kidId: string, lessonId: string): Promise<ActionResult> {
  const enabled = await requireEnabled(kidId);
  if (!enabled.ok) return enabled;
  const licence = await ensureInvestLicence(kidId);
  if (licence.lessonsCompleted.includes(lessonId)) return { ok: true };
  const supabase = await createClient();
  const lessonsCompleted = [...licence.lessonsCompleted, lessonId];
  const { error } = await supabase
    .from("invest_licences")
    .update({ lessons_completed: lessonsCompleted, updated_at: new Date().toISOString() })
    .eq("kid_id", kidId);
  if (error) return { ok: false, error: "Failed to save lesson progress." };
  revalidatePath("/play/invest");
  return { ok: true };
}

export async function submitLicenceQuiz(
  kidId: string,
  answers: number[],
): Promise<{ ok: true; score: number; passed: boolean; alreadyHadLicence: boolean } | { ok: false; error: string }> {
  const enabled = await requireEnabled(kidId);
  if (!enabled.ok) return enabled;
  const licence = await ensureInvestLicence(kidId);
  const score = LICENCE_QUIZ.reduce((sum, q, index) => sum + (answers[index] === q.correctIndex ? 1 : 0), 0);
  const passed = score >= LICENCE_PASS_THRESHOLD;
  const alreadyHadLicence = licence.passedAt !== null;
  const shouldReward = passed && !licence.rewarded;
  const supabase = await createClient();
  const now = new Date().toISOString();

  if (shouldReward) {
    await awardSmartInvestorReward(kidId, enabled.kid.sparks_balance);
  }

  const { error } = await supabase
    .from("invest_licences")
    .update({
      attempts: licence.attempts + 1,
      best_score: Math.max(licence.bestScore, score),
      passed_at: passed ? (licence.passedAt ?? now) : licence.passedAt,
      rewarded: licence.rewarded || shouldReward,
      updated_at: now,
    })
    .eq("kid_id", kidId);
  if (error) return { ok: false, error: "Failed to save quiz result." };
  revalidatePath("/play/invest");
  revalidatePath(`/kid/${kidId}/home`);
  return { ok: true, score, passed, alreadyHadLicence };
}

async function awardSmartInvestorReward(kidId: string, currentSparks: number): Promise<void> {
  const supabase = await createClient();
  await supabase
    .from("kids")
    .update({ sparks_balance: currentSparks + SMART_INVESTOR_SPARKS })
    .eq("id", kidId);

  const { data: badge } = await supabase
    .from("badges")
    .select("id")
    .eq("name", "Smart Investor")
    .maybeSingle();
  if (badge?.id) {
    await supabase.from("kid_badges").upsert({ kid_id: kidId, badge_id: badge.id }, { onConflict: "kid_id,badge_id" });
  }
}
