import ParentShell from "@/components/parent/ParentShell";
import RewardsClient from "@/components/parent/RewardsClient";
import { listKids, listRewardsForKid } from "@/lib/data/stub";

export default async function ParentRewardsPage() {
  const kids = await listKids();
  const all = (await Promise.all(kids.map((k) => listRewardsForKid(k.id)))).flat();
  const seen = new Set<string>();
  const rewards = all.filter((r) => {
    if (seen.has(r.id)) return false;
    seen.add(r.id);
    return true;
  });
  return (
    <ParentShell active="rewards" title="Rewards">
      <RewardsClient rewards={rewards} kids={kids} />
    </ParentShell>
  );
}
