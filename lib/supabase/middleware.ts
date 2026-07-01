import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Middleware-side session refresh.
 *
 * Refreshes Supabase auth cookies on every request and bounces unauthenticated
 * traffic away from protected pages.
 */
export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  // Fast path: no Supabase auth cookies ⇒ there is no session to refresh, so skip
  // the network round-trip to Supabase entirely. This is what made /login show a
  // blank white screen for seconds — every anonymous request was blocked on a
  // remote auth check that could only ever return "no user".
  const hasAuthCookies = request.cookies
    .getAll()
    .some((c) => c.name.startsWith("sb-"));
  if (!hasAuthCookies) {
    const path = request.nextUrl.pathname;
    const needsAuth =
      path.startsWith("/parent") ||
      path.startsWith("/select-kid") ||
      path.startsWith("/kid") ||
      path.startsWith("/play");
    if (needsAuth) {
      const loginUrl = request.nextUrl.clone();
      loginUrl.pathname = "/login";
      loginUrl.searchParams.set("next", path);
      return NextResponse.redirect(loginUrl);
    }
    return supabaseResponse;
  }

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // Triggers a refresh if the access token is expired. Bounded by a timeout so a
  // slow/unreachable auth service can never hang every request (and thus brick
  // the whole app on the loading screen) — if it can't verify quickly, let the
  // request through rather than hang or loop.
  let user: Awaited<ReturnType<typeof supabase.auth.getUser>>["data"]["user"] = null;
  try {
    const result = await Promise.race([
      supabase.auth.getUser(),
      new Promise<"timeout">((resolve) => setTimeout(() => resolve("timeout"), 8000)),
    ]);
    if (result === "timeout") return supabaseResponse;
    user = result.data.user;
  } catch {
    return supabaseResponse;
  }

  const url = request.nextUrl.pathname;

  // Protected paths — bounce to /login if no user
  const requiresAuth =
    url.startsWith("/parent") ||
    url.startsWith("/select-kid") ||
    url.startsWith("/kid") ||
    url.startsWith("/play");

  // Public paths
  const isAuthRoute =
    url === "/login" ||
    url === "/signup" ||
    url === "/forgot-password" ||
    url === "/reset-password" ||
    url === "/onboarding";

  if (!user && requiresAuth) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.searchParams.set("next", url);
    return NextResponse.redirect(loginUrl);
  }

  if (user && isAuthRoute) {
    const homeUrl = request.nextUrl.clone();
    homeUrl.pathname = "/select-kid";
    return NextResponse.redirect(homeUrl);
  }

  return supabaseResponse;
}
