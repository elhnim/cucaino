import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { ensureDailyPrices } from "@/lib/trading/prices";
import { ensureDailyRealPrices } from "@/lib/invest/prices";

// Triggered daily by netlify/functions/daily-prices.mts. Generates today's
// trading prices + news using the service-role client (bypasses RLS), so it
// works without a logged-in user. Idempotent: ensureDailyPrices early-returns
// if today's rows already exist.
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  // Optional shared-secret guard. If CRON_SECRET is set, require it; the
  // endpoint is idempotent and harmless, but this keeps it from being poked.
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
  }

  try {
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
      return NextResponse.json(
        { error: "SUPABASE_SERVICE_ROLE_KEY not configured — daily refresh skipped" },
        { status: 500 },
      );
    }
    const admin = createAdminClient();
    // Nugget Market game prices + Invest real stock/crypto prices and news
    await ensureDailyPrices(admin);
    await ensureDailyRealPrices(admin);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}
