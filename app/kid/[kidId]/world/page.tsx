import { redirect } from "next/navigation";

// The 3D world is now Cucaino Park. Keep old links / bookmarks / ?enter= deep links working.
export default async function WorldRedirect({
  params,
  searchParams,
}: {
  params: Promise<{ kidId: string }>;
  searchParams: Promise<{ enter?: string }>;
}) {
  const [{ kidId }, { enter }] = await Promise.all([params, searchParams]);
  redirect(`/park/${kidId}${enter ? `?enter=${encodeURIComponent(enter)}` : ""}`);
}
