import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

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
