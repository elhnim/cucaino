import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

// Hard ceiling on any single DB/auth request so a sleeping or unreachable
// Supabase project can never hang a page render forever — it fails fast and the
// route's error boundary shows a friendly "try again" instead of an endless
// loading screen.
const DB_TIMEOUT_MS = 12_000;

function timeoutFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  if (init?.signal) return fetch(input, init);
  return fetch(input, { ...init, signal: AbortSignal.timeout(DB_TIMEOUT_MS) });
}

/**
 * Server Supabase client — for use in server components and server actions.
 *
 * Reads/writes auth cookies through Next's `cookies()` so SSR and the
 * browser stay in sync. Anon key is fine because RLS enforces access.
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      global: { fetch: timeoutFetch },
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // setAll fails inside Server Components (read-only context).
            // This is fine — middleware refreshes sessions and writes back.
          }
        },
      },
    },
  );
}
