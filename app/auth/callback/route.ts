import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Auth callback — handles the link Supabase emails for confirmations,
 * password resets, and magic links. Exchanges the `?code=...` query
 * param for a session, then redirects.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const nextParam = url.searchParams.get("next") ?? "/select-kid";
  // Only allow relative paths to prevent open-redirect via absolute URLs
  const next = nextParam.startsWith("/") && !nextParam.startsWith("//") ? nextParam : "/select-kid";

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(new URL(next, url.origin));
    }
    return NextResponse.redirect(
      new URL(`/login?error=${encodeURIComponent(error.message)}`, url.origin),
    );
  }

  return NextResponse.redirect(new URL("/login", url.origin));
}
