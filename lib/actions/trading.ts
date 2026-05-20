"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { TRADING_ASSETS, NUGGETS_PER_STAR } from "@/lib/trading/assets";
import { localDateString } from "@/lib/data/queries";

export type TradeResult = { ok: true } | { ok: false; error: string };

const TRADE_FEE_NUGGETS = 1;

export async function depositToTrading(kidId: string, stars: number): Promise<TradeResult> {
  if (stars < 1) return { ok: false, error: "Minimum deposit is 1 star." };
  const supabase = await createClient();

  const { data: kid } = await supabase
    .from("kids")
    .select("points_balance, family_id")
    .eq("id", kidId)
    .maybeSingle();
  if (!kid) return { ok: false, error: "Kid not found." };
  if (kid.points_balance < stars) return { ok: false, error: "Not enough stars." };

  const nuggets = stars * NUGGETS_PER_STAR;

  const { data: existing } = await supabase
    .from("trading_portfolios")
    .select("id, nuggets_balance, total_deposited_stars")
    .eq("kid_id", kidId)
    .maybeSingle();

  // Write portfolio first — only deduct stars if this succeeds
  if (existing) {
    const { error } = await supabase
      .from("trading_portfolios")
      .update({
        nuggets_balance: existing.nuggets_balance + nuggets,
        total_deposited_stars: existing.total_deposited_stars + stars,
      })
      .eq("kid_id", kidId);
    if (error) return { ok: false, error: "Failed to update account." };
  } else {
    const { error } = await supabase.from("trading_portfolios").insert({
      kid_id: kidId,
      family_id: kid.family_id,
      nuggets_balance: nuggets,
      total_deposited_stars: stars,
      total_withdrawn_stars: 0,
    });
    if (error) return { ok: false, error: "Failed to create account." };
  }

  await supabase.rpc("decrement_kid_points", { p_kid_id: kidId, p_amount: stars });

  await supabase.from("trading_transactions").insert({
    family_id: kid.family_id,
    kid_id: kidId,
    type: "deposit",
    total_nuggets: nuggets,
    fee_nuggets: 0,
  });

  revalidatePath(`/play/trading`);
  revalidatePath(`/kid/${kidId}/home`);
  return { ok: true };
}

export async function withdrawFromTrading(kidId: string, stars: number): Promise<TradeResult> {
  if (stars < 1) return { ok: false, error: "Minimum withdrawal is 1 star." };
  const supabase = await createClient();

  const { data: portfolio } = await supabase
    .from("trading_portfolios")
    .select("id, nuggets_balance, total_withdrawn_stars, family_id")
    .eq("kid_id", kidId)
    .maybeSingle();
  if (!portfolio) return { ok: false, error: "No trading account found." };

  const required = stars * NUGGETS_PER_STAR;
  if (portfolio.nuggets_balance < required) return { ok: false, error: "Not enough Nuggets." };

  await supabase
    .from("trading_portfolios")
    .update({
      nuggets_balance: portfolio.nuggets_balance - required,
      total_withdrawn_stars: portfolio.total_withdrawn_stars + stars,
    })
    .eq("kid_id", kidId);

  await supabase.rpc("increment_kid_points", { p_kid_id: kidId, p_amount: stars });

  await supabase.from("trading_transactions").insert({
    family_id: portfolio.family_id,
    kid_id: kidId,
    type: "withdraw",
    total_nuggets: required,
    fee_nuggets: 0,
  });

  revalidatePath(`/play/trading`);
  revalidatePath(`/kid/${kidId}/home`);
  return { ok: true };
}

async function fetchTodayPrice(supabase: Awaited<ReturnType<typeof createClient>>, symbol: string): Promise<number | null> {
  const { data } = await supabase
    .from("trading_asset_prices")
    .select("price_nuggets")
    .eq("symbol", symbol)
    .order("price_date", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data?.price_nuggets ?? null;
}

export async function buyAsset(
  kidId: string,
  symbol: string,
  quantity: number,
): Promise<TradeResult> {
  try {
    if (quantity < 0.1) return { ok: false, error: "Minimum purchase is 0.1 shares." };

    const supabase = await createClient();

    const serverPrice = await fetchTodayPrice(supabase, symbol);
    if (serverPrice === null) return { ok: false, error: "Price not available yet. Try again soon." };

    const { data: portfolio } = await supabase
      .from("trading_portfolios")
      .select("id, nuggets_balance, family_id")
      .eq("kid_id", kidId)
      .maybeSingle();
    if (!portfolio) return { ok: false, error: "No trading account found. Deposit stars first." };

    const cost = Math.ceil(quantity * serverPrice) + TRADE_FEE_NUGGETS;
    if (portfolio.nuggets_balance < cost)
      return { ok: false, error: `Need 🪙 ${cost} Nuggets but only have 🪙 ${portfolio.nuggets_balance}.` };

    await supabase
      .from("trading_portfolios")
      .update({ nuggets_balance: portfolio.nuggets_balance - cost })
      .eq("kid_id", kidId);

    const { data: existing } = await supabase
      .from("trading_holdings")
      .select("quantity, avg_cost_nuggets")
      .eq("kid_id", kidId)
      .eq("asset_symbol", symbol)
      .maybeSingle();

    const oldQty = existing ? Number(existing.quantity) : 0;
    const oldAvg = existing ? Number(existing.avg_cost_nuggets) : 0;
    const newQty = oldQty + quantity;
    const newAvg = (oldQty * oldAvg + quantity * serverPrice) / newQty;

    await supabase.from("trading_holdings").upsert(
      {
        kid_id: kidId,
        family_id: portfolio.family_id,
        asset_symbol: symbol,
        quantity: newQty,
        avg_cost_nuggets: Math.round(newAvg * 100) / 100,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "kid_id,asset_symbol" },
    );

    await supabase.from("trading_transactions").insert({
      family_id: portfolio.family_id,
      kid_id: kidId,
      type: "buy",
      asset_symbol: symbol,
      quantity,
      price_nuggets: serverPrice,
      total_nuggets: cost,
      fee_nuggets: TRADE_FEE_NUGGETS,
    });

    revalidatePath(`/play/trading`);
    return { ok: true };
  } catch (err) {
    console.error("buyAsset error:", err);
    return { ok: false, error: "Something went wrong. Please try again." };
  }
}

export async function sellAsset(
  kidId: string,
  symbol: string,
  quantity: number,
): Promise<TradeResult> {
  try {
    if (quantity <= 0) return { ok: false, error: "Quantity must be positive." };

    const supabase = await createClient();

    const serverPrice = await fetchTodayPrice(supabase, symbol);
    if (serverPrice === null) return { ok: false, error: "Price not available yet. Try again soon." };

    // Fetch both holding and portfolio up front before any mutations
    const [{ data: holding }, { data: portfolio }] = await Promise.all([
      supabase
        .from("trading_holdings")
        .select("id, quantity, family_id")
        .eq("kid_id", kidId)
        .eq("asset_symbol", symbol)
        .maybeSingle(),
      supabase
        .from("trading_portfolios")
        .select("nuggets_balance, family_id")
        .eq("kid_id", kidId)
        .maybeSingle(),
    ]);

    if (!holding) return { ok: false, error: "You don't own any shares in this company." };
    if (!portfolio) return { ok: false, error: "No trading account found." };

    const ownedQty = Number(holding.quantity);
    if (ownedQty < quantity) return { ok: false, error: `You only own ${ownedQty} shares.` };

    const proceeds = Math.max(0, Math.floor(quantity * serverPrice) - TRADE_FEE_NUGGETS);
    const remaining = ownedQty - quantity;

    if (remaining < 0.001) {
      await supabase.from("trading_holdings").delete().eq("id", holding.id);
    } else {
      await supabase
        .from("trading_holdings")
        .update({ quantity: remaining, updated_at: new Date().toISOString() })
        .eq("id", holding.id);
    }

    await supabase
      .from("trading_portfolios")
      .update({ nuggets_balance: portfolio.nuggets_balance + proceeds })
      .eq("kid_id", kidId);

    await supabase.from("trading_transactions").insert({
      family_id: portfolio.family_id,
      kid_id: kidId,
      type: "sell",
      asset_symbol: symbol,
      quantity,
      price_nuggets: serverPrice,
      total_nuggets: proceeds,
      fee_nuggets: TRADE_FEE_NUGGETS,
    });

    revalidatePath(`/play/trading`);
    return { ok: true };
  } catch (err) {
    console.error("sellAsset error:", err);
    return { ok: false, error: "Something went wrong. Please try again." };
  }
}

export async function creditPendingDividends(kidId: string): Promise<void> {
  const supabase = await createClient();

  const { data: portfolio } = await supabase
    .from("trading_portfolios")
    .select("nuggets_balance, family_id")
    .eq("kid_id", kidId)
    .maybeSingle();
  if (!portfolio) return;

  const { data: holdings } = await supabase
    .from("trading_holdings")
    .select("asset_symbol, quantity")
    .eq("kid_id", kidId)
    .gt("quantity", 0);

  const dividendAssets = TRADING_ASSETS.filter((a) => a.paysDividend).map((a) => a.symbol);
  const eligibleHoldings = (holdings ?? []).filter((h) => dividendAssets.includes(h.asset_symbol));
  if (eligibleHoldings.length === 0) return;

  const { data: lastDividends } = await supabase
    .from("trading_transactions")
    .select("asset_symbol, created_at")
    .eq("kid_id", kidId)
    .eq("type", "dividend")
    .in("asset_symbol", eligibleHoldings.map((h) => h.asset_symbol))
    .order("created_at", { ascending: false });

  const lastDivMap = new Map<string, string>();
  for (const tx of lastDividends ?? []) {
    if (tx.asset_symbol && !lastDivMap.has(tx.asset_symbol)) {
      lastDivMap.set(tx.asset_symbol, tx.created_at);
    }
  }

  const today = localDateString("UTC");
  const { data: prices } = await supabase
    .from("trading_asset_prices")
    .select("symbol, price_nuggets")
    .in("symbol", eligibleHoldings.map((h) => h.asset_symbol))
    .eq("price_date", today);

  const priceMap = new Map<string, number>();
  for (const p of prices ?? []) priceMap.set(p.symbol, p.price_nuggets);

  const now = Date.now();
  const thirtyDaysMs = 7 * 24 * 60 * 60 * 1000;
  let totalDividend = 0;

  type DivTx = {
    family_id: string;
    kid_id: string;
    type: string;
    asset_symbol: string;
    total_nuggets: number;
    fee_nuggets: number;
  };
  const divTransactions: DivTx[] = [];

  for (const holding of eligibleHoldings) {
    const lastDiv = lastDivMap.get(holding.asset_symbol);
    if (lastDiv && now - new Date(lastDiv).getTime() < thirtyDaysMs) continue;

    const price = priceMap.get(holding.asset_symbol) ?? 0;
    const dividend = Math.max(1, Math.round(Number(holding.quantity) * price * 0.02));
    totalDividend += dividend;
    divTransactions.push({
      family_id: portfolio.family_id,
      kid_id: kidId,
      type: "dividend",
      asset_symbol: holding.asset_symbol,
      total_nuggets: dividend,
      fee_nuggets: 0,
    });
  }

  if (totalDividend > 0) {
    await supabase
      .from("trading_portfolios")
      .update({ nuggets_balance: portfolio.nuggets_balance + totalDividend })
      .eq("kid_id", kidId);
    await supabase.from("trading_transactions").insert(divTransactions);
  }
}
