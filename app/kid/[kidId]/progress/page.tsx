import { notFound } from "next/navigation";
import KidShell from "@/components/kid/KidShell";
import { getKid } from "@/lib/data/stub";

export default async function ProgressPage({
  params,
}: {
  params: Promise<{ kidId: string }>;
}) {
  const { kidId } = await params;
  const kid = await getKid(kidId);
  if (!kid) notFound();

  return (
    <KidShell kid={kid} active="progress">
      <div className="p-4 md:p-5">
        <h2 className="text-2xl md:text-3xl font-black mb-4">🏆 My Progress</h2>

        <div className="grid grid-cols-3 gap-3 mb-6">
          <Stat icon="🔥" value={kid.currentStreak} label="DAY STREAK" hint={`Best: ${kid.longestStreak}`} />
          <Stat icon="⭐" value={kid.pointsBalance} label="POINTS" hint="this week: +75" />
          <Stat icon="🎯" value="87%" label="DONE THIS WEEK" hint="26 of 30 tasks" />
        </div>

        <h3 className="text-sm font-bold text-gray-500 mb-2">🏅 BADGES</h3>
        <div className="grid grid-cols-3 md:grid-cols-5 gap-3 mb-6">
          {[
            { icon: "🌟", name: "First star", earned: true },
            { icon: "🔥", name: "3-day streak", earned: true },
            { icon: "🎹", name: "Music maker", earned: true },
            { icon: "🏃", name: "Move it!", earned: true },
            { icon: "🏆", name: "7-day streak", earned: false },
          ].map((b) => (
            <div
              key={b.name}
              className={`rounded-2xl p-3 text-center shadow ${
                b.earned ? "bg-white" : "bg-gray-100 opacity-50"
              }`}
            >
              <div className={`text-4xl ${b.earned ? "" : "grayscale"}`}>{b.icon}</div>
              <div className="text-xs font-bold mt-1">{b.name}</div>
            </div>
          ))}
        </div>
      </div>
    </KidShell>
  );
}

function Stat({
  icon,
  value,
  label,
  hint,
}: {
  icon: string;
  value: string | number;
  label: string;
  hint?: string;
}) {
  return (
    <div className="bg-white rounded-2xl p-4 text-center shadow">
      <div className="text-4xl">{icon}</div>
      <div className="text-2xl md:text-3xl font-black mt-1">{value}</div>
      <div className="text-xs text-gray-500 font-bold">{label}</div>
      {hint ? <div className="text-xs text-gray-400 mt-1">{hint}</div> : null}
    </div>
  );
}
