import { getParentPinFromDb, listPendingRequests, getFamily } from "@/lib/data/queries";
import ParentPinGateClient from "@/components/parent/ParentPinGateClient";
import ParentShell from "@/components/parent/ParentShell";
import { ParentOnboardingWrapper } from "@/components/onboarding/ParentOnboardingWrapper";

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
        <ParentOnboardingWrapper
          parentTourSeen={family?.parentTourSeen ?? true}
          familyName={family?.name ?? ""}
        >
          {children}
        </ParentOnboardingWrapper>
      </ParentShell>
    </ParentPinGateClient>
  );
}
