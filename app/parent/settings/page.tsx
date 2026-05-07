import ParentPinClient from "@/components/parent/ParentPinClient";
import { getParentPinFromDb } from "@/lib/data/stub";

const commit = process.env.COMMIT_REF?.slice(0, 7) ?? process.env.NEXT_PUBLIC_COMMIT_REF?.slice(0, 7) ?? "dev";

const RELEASES: { date: string; notes: string[] }[] = [
  {
    date: "8 May 2026",
    notes: [
      "🎒 School bag items editor (Parent → Kids)",
      "🎮 Quiz picks random questions from bank (5/10/15/20/All)",
      "⚡ Nav moved to top, much faster page transitions",
      "🔒 PIN confirm screen now shows 'Type it again'",
      "✏️ Custom subject type in timetable editor",
      "✅ Task completions now save correctly",
    ],
  },
];

export default async function ParentSettingsPage() {
  const currentPin = await getParentPinFromDb();
  return (
    <div className="p-4 space-y-4">
      <ParentPinClient currentPin={currentPin} />

      {/* Release notes */}
      <div className="bg-white rounded-2xl shadow p-4 space-y-3">
        <div className="text-xs font-black text-gray-500 uppercase tracking-wider">What&apos;s new</div>
        {RELEASES.map((r) => (
          <div key={r.date}>
            <div className="text-xs font-bold text-indigo-600 mb-1">{r.date}</div>
            <ul className="space-y-0.5">
              {r.notes.map((note) => (
                <li key={note} className="text-xs text-gray-700 leading-snug">{note}</li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      <p className="text-center text-xs text-gray-400">
        Cucaino · build <span className="font-mono">{commit}</span>
      </p>
    </div>
  );
}
