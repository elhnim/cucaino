import { notFound } from "next/navigation";
import { getReward, listKids } from "@/lib/data/stub";
import RewardFormClient from "../../RewardFormClient";

export default async function RewardEditPage({
  params,
}: {
  params: Promise<{ rewardId: string }>;
}) {
  const { rewardId } = await params;
  const [reward, kids] = await Promise.all([getReward(rewardId), listKids()]);
  if (!reward) notFound();
  return <RewardFormClient reward={reward} kids={kids} />;
}
