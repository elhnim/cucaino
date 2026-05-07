import { getParentPinFromDb, listPendingRequests } from "@/lib/data/queries";
import ParentPinGateClient from "@/components/parent/ParentPinGateClient";
import ParentShell from "@/components/parent/ParentShell";

export default async function ParentLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [parentPin, pending] = await Promise.all([
    getParentPinFromDb(),
    listPendingRequests(),
  ]);
  return (
    <ParentPinGateClient parentPin={parentPin}>
      <ParentShell pendingCount={pending.length}>
        {children}
      </ParentShell>
    </ParentPinGateClient>
  );
}
