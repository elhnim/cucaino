import { getKid } from "@/lib/data/stub";
import KidShell from "@/components/kid/KidShell";
import { STORIES } from "@/lib/stories/registry";
import { getStoryProgress } from "@/lib/actions/stories";
import StoryLibrary from "@/components/library/StoryLibrary";

export default async function LibraryPage({
  searchParams,
}: {
  searchParams: Promise<{ kid?: string }>;
}) {
  const { kid: kidId } = await searchParams;
  const kid = kidId ? await getKid(kidId) : null;
  const progress = kid ? await getStoryProgress(kid.id) : [];

  const content = <StoryLibrary stories={STORIES} kidId={kid?.id ?? null} initialProgress={progress} />;

  if (kid) {
    return <KidShell kid={kid} active="play">{content}</KidShell>;
  }
  return content;
}
