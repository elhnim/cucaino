import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const USERNAME_RE = /^[a-z0-9_]{3,20}$/i;

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ available: false, reason: "unauthenticated" }, { status: 401 });
  }

  const { searchParams } = req.nextUrl;
  const username = searchParams.get("username") ?? "";
  const kidId = searchParams.get("kidId") ?? "";

  if (!USERNAME_RE.test(username)) {
    return NextResponse.json({ available: false, reason: "invalid_format" });
  }

  let query = supabase
    .from("kids")
    .select("id")
    .ilike("username", username)
    .limit(1);

  if (kidId) {
    query = query.neq("id", kidId);
  }

  const { data, error } = await query;
  if (error) {
    return NextResponse.json(
      { available: false, reason: "error" },
      { status: 500 }
    );
  }

  return NextResponse.json({ available: (data ?? []).length === 0 });
}
