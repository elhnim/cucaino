import { notFound } from "next/navigation";
import Link from "next/link";
import KidShell from "@/components/kid/KidShell";
import Tuner from "@/components/kid/Tuner";
import { getKid } from "@/lib/data/stub";
import { getTheme } from "@/lib/themes/presets";

export default async function TunerPage({
  params,
  searchParams,
}: {
  params: Promise<{ kidId: string }>;
  searchParams: Promise<{ taskId?: string }>;
}) {
  const { kidId } = await params;
  const { taskId } = await searchParams;
  const kid = await getKid(kidId);
  if (!kid) notFound();
  const theme = getTheme(kid.themeId);

  const backHref = taskId
    ? `/kid/${kid.id}/practice/${taskId}`
    : `/kid/${kid.id}/todo`;

  return (
    <KidShell kid={kid} active="home">
      <div className="p-4 md:p-6">
        <Link
          href={backHref}
          className="inline-flex items-center gap-1.5 text-sm font-bold px-4 py-2 rounded-2xl mb-4 text-white"
          style={{ background: theme.accent }}
        >
          ← Back
        </Link>
        <p className="text-sm text-gray-600 mb-4">
          🎻 Violin and 🪕 ukulele tuner. Allow mic access when asked, then play one string at a time.
        </p>
        <Tuner accent={theme.accent} />
      </div>
    </KidShell>
  );
}
