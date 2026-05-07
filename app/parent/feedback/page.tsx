import ParentShell from "@/components/parent/ParentShell";
import FeedbackBoard from "@/components/parent/FeedbackBoard";
import { listFeatureRequests } from "@/lib/data/stub";

export default async function ParentFeedbackPage() {
  const items = await listFeatureRequests();
  return (
    <ParentShell active="feedback" title="Feature ideas">
      <FeedbackBoard initialItems={items} />
    </ParentShell>
  );
}
