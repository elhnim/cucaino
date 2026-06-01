// Scheduled daily generator for Nugget Market prices + news. Runs in a real
// function context (not killed mid-write like the page's old fire-and-forget)
// and simply pokes the in-app cron route, which does the work in Next.js
// context with the service-role client.
export const config = {
  schedule: "5 0 * * *", // 00:05 UTC daily
};

export default async function dailyPrices() {
  const base = process.env.URL || process.env.NEXT_PUBLIC_SITE_URL;
  if (!base) return new Response("missing site url", { status: 200 });

  const secret = process.env.CRON_SECRET;
  await fetch(`${base}/api/cron/daily-prices`, {
    headers: secret ? { Authorization: `Bearer ${secret}` } : {},
  }).catch(() => {});

  return new Response("ok", { status: 200 });
}
