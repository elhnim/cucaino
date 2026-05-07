import { getParentPinFromDb } from "@/lib/data/queries";
import ParentPinGateClient from "@/components/parent/ParentPinGateClient";

export default async function ParentLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const parentPin = await getParentPinFromDb();
  return (
    <ParentPinGateClient parentPin={parentPin}>
      {children}
    </ParentPinGateClient>
  );
}
