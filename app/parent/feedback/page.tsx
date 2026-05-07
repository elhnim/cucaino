import FeedbackBoard from "@/components/parent/FeedbackBoard";
import { listFeatureRequests } from "@/lib/data/stub";

export default async function ParentFeedbackPage() {
  const items = await listFeatureRequests();
  return <FeedbackBoard initialItems={items} />;
}
