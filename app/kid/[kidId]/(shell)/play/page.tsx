import { redirect } from "next/navigation";

// The play hub is the Rides & Games station in Cucaino Park now.
export default async function PlayRedirect({ params }: { params: Promise<{ kidId: string }> }) {
  const { kidId } = await params;
  redirect(`/park/${kidId}?enter=rides`);
}
