import { listKids, listPendingRequests, listRewardsForKid } from "@/lib/data/stub";
import RequestActions from "@/components/parent/RequestActions";

export default async function ParentRequestsPage() {
  const [kids, requests] = await Promise.all([listKids(), listPendingRequests()]);
  const kidById = new Map(kids.map((k) => [k.id, k]));

  // Build reward lookup (only the rewards that match a request, but easier to load all)
  const allRewards = (await Promise.all(kids.map((k) => listRewardsForKid(k.id)))).flat();
  const rewardById = new Map(allRewards.map((r) => [r.id, r]));

  return (
    <div className="p-4 space-y-3">
        {requests.length === 0 ? (
          <div className="text-center text-sm text-gray-500 py-12">
            No pending requests. ✨
          </div>
        ) : (
          requests.map((req) => {
            const kid = kidById.get(req.kidId);
            const reward = rewardById.get(req.rewardId);
            if (!kid || !reward) return null;
            const ago = Math.round(
              (Date.now() - new Date(req.requestedAt).getTime()) / 60_000,
            );
            return (
              <div
                key={req.id}
                className="bg-white rounded-2xl shadow p-4 border-l-4"
                style={{ borderColor: kid.themeId === "magical" ? "#ec4899" : "#f97316" }}
              >
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-10 h-10 rounded-full bg-orange-100 flex items-center justify-center text-2xl">
                    {kid.avatar}
                  </div>
                  <div>
                    <div className="font-bold">{kid.name}</div>
                    <div className="text-xs text-gray-500">{ago} minutes ago</div>
                  </div>
                </div>
                <div className="bg-pink-50 border border-pink-200 rounded-xl p-3 mb-3">
                  <div className="flex items-center gap-3">
                    <div className="text-3xl">{reward.icon}</div>
                    <div className="flex-1">
                      <div className="font-bold">{reward.name}</div>
                      <div className="text-xs text-gray-600">
                        {req.paymentType === "cash"
                          ? `Cost: $${(reward.costCashCents / 100).toFixed(2)} 💵 · Has $${(kid.cashBalance / 100).toFixed(2)}`
                          : `Cost: ${reward.costPoints} ⭐ · Has ${kid.pointsBalance} ⭐`}
                      </div>
                    </div>
                  </div>
                </div>
                <RequestActions requestId={req.id} />
              </div>
            );
          })
        )}
      </div>
  );
}
