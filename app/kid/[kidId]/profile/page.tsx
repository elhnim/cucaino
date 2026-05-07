import { notFound } from "next/navigation";
import KidShell from "@/components/kid/KidShell";
import ProfileEditor from "@/components/kid/ProfileEditor";
import { getKid } from "@/lib/data/stub";
import { getTheme } from "@/lib/themes/presets";
import { listThemes } from "@/lib/themes/presets";

export default async function ProfilePage({
  params,
}: {
  params: Promise<{ kidId: string }>;
}) {
  const { kidId } = await params;
  const kid = await getKid(kidId);
  if (!kid) notFound();
  const theme = getTheme(kid.themeId);
  const allThemes = listThemes();

  return (
    <KidShell kid={kid} active="profile">
      <div className="p-4 md:p-6">
        <ProfileEditor kid={kid} accent={theme.accent} themes={allThemes} />
      </div>
    </KidShell>
  );
}
