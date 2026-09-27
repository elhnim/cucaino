import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Middleware-side session refresh.
 *
 * Refreshes Supabase auth cookies on every request and bounces unauthenticated
 * traffic away from protected pages.
 */
/**
 * Reads the access-token expiry straight from the Supabase auth cookie (no network).
 * @supabase/ssr stores `sb-<ref>-auth-token` as "base64-" + base64url(JSON session),
 * split into `.0`, `.1`, ... chunks when large. Returns null if it can't be read, in which
 * case the caller falls back to the network check.
 */
function sessionExpiresAt(request: NextRequest): number | null {
  try {
    const all = request.cookies.getAll().filter((c) => /^sb-.*-auth-token(\.\d+)?$/.test(c.name));
    if (all.length === 0) return null;
    const joined = all
      .sort((a, b) => Number(a.name.split(".").pop()) - Number(b.name.split(".").pop()))
      .map((c) => c.value)
      .join("");
    const raw = joined.startsWith("base64-") ? atob(joined.slice(7).replace(/-/g, "+").replace(/_/g, "/")) : joined;
    const session = JSON.parse(raw) as { expires_at?: number };
    return typeof session.expires_at === "number" ? session.expires_at : null;
  } catch {
    return null;
  }
}

const AUTH_ROUTES = ["/login", "/signup", "/forgot-password", "/reset-password", "/onboarding"];

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
      path.startsWith("/play") ||
      path.startsWith("/park");
    if (needsAuth) {
      const loginUrl = request.nextUrl.clone();
      loginUrl.pathname = "/login";
      loginUrl.searchParams.set("next", path);
      return NextResponse.redirect(loginUrl);
    }
    return supabaseResponse;
  }

  // Fast path for signed-in kids: while the access token is still comfortably valid there is
  // nothing to refresh, so don't pay a round trip to Supabase Auth (in another region) before
  // serving every page, prefetch and RSC request. This gate is only a UX redirect — every
  // data read is still authorised by Postgres RLS against the real JWT.
  const expiresAt = sessionExpiresAt(request);
  if (expiresAt && expiresAt * 1000 - Date.now() > 5 * 60 * 1000) {
    const path = request.nextUrl.pathname;
    if (AUTH_ROUTES.includes(path)) {
      const homeUrl = request.nextUrl.clone();
      homeUrl.pathname = "/select-kid";
      return NextResponse.redirect(homeUrl);
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

  // Triggers a refresh if the access token is expired
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const url = request.nextUrl.pathname;

  // Protected paths — bounce to /login if no user
  const requiresAuth =
    url.startsWith("/parent") ||
    url.startsWith("/select-kid") ||
    url.startsWith("/kid") ||
    url.startsWith("/play") ||
    url.startsWith("/park");

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
