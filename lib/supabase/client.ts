import { createBrowserClient } from "@supabase/ssr";

/**
 * Browser Supabase client — for use in client components only.
 *
 * Uses the publishable anon key. Row-level security in Postgres is what
 * actually protects family data; the anon key is safe to ship to clients.
 */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
