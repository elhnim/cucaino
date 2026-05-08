import { notFound } from "next/navigation";
import { getKid } from "@/lib/data/stub";
import ParentKidEditClient from "./ParentKidEditClient";

export default async function ParentKidEditPage({
  params,
}: {
  params: Promise<{ kidId: string }>;
}) {
  const { kidId } = await params;
  const kid = await getKid(kidId);
  if (!kid) notFound();
  return <ParentKidEditClient kid={kid} />;
}
