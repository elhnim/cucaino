"use client";

import { useRouter } from "next/navigation";

const TYPES = [
  { value: "", label: "All Types" },
  { value: "treat", label: "🍬 Treat" },
  { value: "privilege", label: "🔓 Privilege" },
  { value: "experience", label: "✨ Experience" },
  { value: "prize", label: "🎀 Prize" },
];

export default function RewardFilterBar({
  type,
  kidId,
  kids,
}: {
  type: string;
  kidId: string;
  kids: Array<{ id: string; name: string }>;
}) {
  const router = useRouter();

  function push(newType: string, newKidId: string) {
    const params = new URLSearchParams();
    if (newType) params.set("type", newType);
    if (newKidId) params.set("kid", newKidId);
    router.push(`/parent/rewards?${params.toString()}`);
  }

  const selectClass =
    "flex-1 w-full border-[1.5px] border-gray-200 rounded-xl bg-white text-sm font-semibold text-gray-800 px-3 py-2 appearance-none cursor-pointer focus:outline-none focus:border-indigo-400";

  return (
    <div className="flex gap-2 px-4 py-2.5 bg-white border-b border-gray-100">
      <div className="flex-1 relative">
        <select className={selectClass} value={type} onChange={(e) => push(e.target.value, kidId)}>
          {TYPES.map((t) => (
            <option key={t.value} value={t.value}>{t.label}</option>
          ))}
        </select>
        <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 text-xs">▾</span>
      </div>
      <div className="flex-1 relative">
        <select className={selectClass} value={kidId} onChange={(e) => push(type, e.target.value)}>
          <option value="">All Kids</option>
          {kids.map((k) => (
            <option key={k.id} value={k.id}>{k.name}</option>
          ))}
        </select>
        <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 text-xs">▾</span>
      </div>
    </div>
  );
}
