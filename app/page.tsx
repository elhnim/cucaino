import { redirect } from "next/navigation";

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ code?: string }>;
}) {
  const { code } = await searchParams;
  // If Supabase emailed the user a confirmation link with `?code=...`,
  // forward to the auth callback route so the code can be exchanged for
  // a session before they land on /select-kid.
  if (code) redirect(`/auth/callback?code=${encodeURIComponent(code)}`);
  redirect("/select-kid");
}
