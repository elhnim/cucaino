import { notFound } from "next/navigation";
import KidShell from "@/components/kid/KidShell";
import Tuner from "@/components/kid/Tuner";
import { getKid } from "@/lib/data/stub";
import { getTheme } from "@/lib/themes/presets";

export default async function TunerPage({
  params,
}: {
  params: Promise<{ kidId: string }>;
}) {
  const { kidId } = await params;
  const kid = await getKid(kidId);
  if (!kid) notFound();
  const theme = getTheme(kid.themeId);

  return (
    <KidShell kid={kid} active="today">
      <div className="p-4 md:p-6">
        <p className="text-sm text-gray-600 mb-4">
          🎻 Violin and 🪕 ukulele tuner. Allow mic access when asked, then play one string at a time.
        </p>
        <Tuner accent={theme.accent} />
      </div>
    </KidShell>
  );
}
