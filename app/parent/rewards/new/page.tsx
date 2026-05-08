import { listKids } from "@/lib/data/stub";
import RewardFormClient from "../RewardFormClient";

export default async function NewRewardPage() {
  const kids = await listKids();
  return <RewardFormClient kids={kids} />;
}
