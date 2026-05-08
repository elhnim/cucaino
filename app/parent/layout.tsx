import { getParentPinFromDb, listPendingRequests, getFamily } from "@/lib/data/queries";
import ParentPinGateClient from "@/components/parent/ParentPinGateClient";
import ParentShell from "@/components/parent/ParentShell";

export default async function ParentLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [parentPin, pending, family] = await Promise.all([
    getParentPinFromDb(),
    listPendingRequests(),
    getFamily(),
  ]);
  return (
    <ParentPinGateClient parentPin={parentPin}>
      <ParentShell
        pendingCount={pending.length}
        displayName={family?.parentDisplayName ?? null}
        avatar={family?.parentAvatar ?? "🧙"}
      >
        {children}
      </ParentShell>
    </ParentPinGateClient>
  );
}
