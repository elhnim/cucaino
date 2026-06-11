export const config = {
  schedule: "*/10 * * * *",
};

export default async function keepalive() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return new Response("missing env", { status: 200 });

  // Ping Supabase REST API to prevent the free-tier project from sleeping
  await fetch(`${url}/rest/v1/families?select=id&limit=1`, {
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
    },
  }).catch(() => {});

  // Also warm the Next.js server function so the first app open after idle
  // doesn't pay a Lambda cold start. An unknown path bypasses the static CDN
  // layer and forces the SSR function to render (a cheap 404).
  const site = process.env.URL;
  if (site) {
    await fetch(`${site}/keepalive-warmup`, { redirect: "manual" }).catch(() => {});
  }

  return new Response("ok", { status: 200 });
}
