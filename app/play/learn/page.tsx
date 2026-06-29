import Link from "next/link";
import { getKid } from "@/lib/data/stub";
import KidShell from "@/components/kid/KidShell";
import { COURSES } from "@/lib/courses/registry";

export default async function LearnPage({
  searchParams,
}: {
  searchParams: Promise<{ kid?: string }>;
}) {
  const { kid: kidId } = await searchParams;
  const kid = kidId ? await getKid(kidId) : null;
  const q = kid ? `?kid=${kid.id}` : "";

  const content = (
    <div className="min-h-screen bg-gradient-to-b from-amber-50 to-rose-50">
      <div className="max-w-lg mx-auto p-4 pt-5">
        <div className="flex items-center gap-3 mb-5">
          <Link href={kid ? `/kid/${kid.id}/play` : "/select-kid"} className="text-sm font-bold text-gray-500 shrink-0">← Play</Link>
          <h1 className="text-2xl font-black text-rose-900 flex-1">📚 Learn</h1>
        </div>
        <p className="text-sm text-gray-500 mb-4">Mini-courses from the best books — read, take the quiz, earn ⭐ stars.</p>

        <div className="space-y-3">
          {COURSES.map((course) => (
            <Link
              key={course.id}
              href={`/play/course/${course.id}${q}`}
              className="block bg-white rounded-3xl shadow-sm p-5 active:scale-[0.98] transition-transform"
            >
              <div className="flex items-center gap-3">
                <span className="text-4xl shrink-0">{course.emoji}</span>
                <div className="flex-1 min-w-0">
                  <div className="text-lg font-black text-gray-900">{course.title}</div>
                  <div className="text-xs text-gray-500">{course.subtitle}</div>
                  <div className="text-[11px] font-bold text-rose-500 mt-1">{course.lessons.length} lessons · earn ⭐</div>
                </div>
                <span className="text-rose-400 font-black">→</span>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );

  if (kid) {
    return <KidShell kid={kid} active="play">{content}</KidShell>;
  }
  return content;
}
