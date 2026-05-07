import { notFound } from "next/navigation";
import KidShell from "@/components/kid/KidShell";
import { getKid, listRewardsForKid } from "@/lib/data/stub";

export default async function RewardsPage({
  params,
}: {
  params: Promise<{ kidId: string }>;
}) {
  const { kidId } = await params;
  const kid = await getKid(kidId);
  if (!kid) notFound();

  const rewards = await listRewardsForKid(kid.id);
  const individual = rewards.filter((r) => r.type === "individual");
  const family = rewards.filter((r) => r.type === "family");

  return (
    <KidShell kid={kid} active="rewards">
      <div className="p-4 md:p-5">
        <h2 className="text-2xl md:text-3xl font-black mb-1">🎁 Rewards</h2>
        <p className="text-sm text-gray-600 mb-4">
          You have <strong>{kid.pointsBalance} ⭐</strong> to spend
        </p>

        <h3 className="text-sm font-bold text-gray-500 mb-2">JUST FOR YOU</h3>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-6">
          {individual.map((r) => {
            const canAfford = kid.pointsBalance >= r.costPoints;
            return (
              <div
                key={r.id}
                className={`bg-white rounded-2xl p-4 shadow ${
                  canAfford ? "" : "opacity-50"
                }`}
              >
                <div className="text-5xl text-center mb-2">{r.icon}</div>
                <div className="font-black text-center text-sm">{r.name}</div>
                <div className="text-center mt-1">
                  <span className="bg-yellow-100 text-yellow-800 px-2 py-0.5 rounded-full text-xs font-bold">
                    {r.costPoints} ⭐
                  </span>
                </div>
                <button
                  type="button"
                  disabled={!canAfford}
                  className={`mt-3 w-full font-bold py-2 rounded-lg text-sm ${
                    canAfford
                      ? "bg-pink-500 hover:bg-pink-600 text-white"
                      : "bg-gray-200 text-gray-500 cursor-not-allowed"
                  }`}
                >
                  {canAfford ? "Redeem" : `Need ${r.costPoints - kid.pointsBalance} more`}
                </button>
              </div>
            );
          })}
        </div>

        <h3 className="text-sm font-bold text-gray-500 mb-2">FAMILY REWARDS</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {family.map((r) => (
            <div
              key={r.id}
              className="bg-gradient-to-br from-purple-100 to-pink-100 rounded-2xl p-4 border-2 border-purple-300"
            >
              <div className="flex items-center gap-3">
                <div className="text-5xl">{r.icon}</div>
                <div className="flex-1">
                  <div className="font-black">{r.name}</div>
                  {r.description ? (
                    <div className="text-xs text-purple-700">{r.description}</div>
                  ) : null}
                  <div className="text-xs mt-1 font-bold">{r.costPoints} ⭐</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </KidShell>
  );
}
