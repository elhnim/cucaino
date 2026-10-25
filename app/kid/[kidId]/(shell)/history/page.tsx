import { notFound } from "next/navigation";
import { getKid, listKidHistory, listCashTransactions } from "@/lib/data/stub";
import { getTheme } from "@/lib/themes/presets";
import HistoryTabs from "@/components/kid/HistoryTabs";

export default async function KidHistoryPage({
  params,
  searchParams,
}: {
  params: Promise<{ kidId: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const { kidId } = await params;
  const { tab } = await searchParams;
  const [kid, entries, cashTxns] = await Promise.all([
    getKid(kidId),
    listKidHistory(kidId, 14),
    listCashTransactions(kidId, 14),
  ]);
  if (!kid) notFound();
  const theme = getTheme(kid.themeId);

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-black">📋 My History</h2>
        {kid.cashBalance > 0 && (
          <div
            className="flex items-center gap-1 px-3 py-1.5 rounded-full text-sm font-black"
            style={{ background: "#dcfce7", color: "#15803d" }}
          >
            💵 ${(kid.cashBalance / 100).toFixed(2)}
          </div>
        )}
      </div>
      <HistoryTabs
        entries={entries}
        cashTxns={cashTxns}
        theme={theme}
        initialTab={(tab === "cash" ? "cash" : "stars") as "stars" | "cash"}
        emptyDaysLabel="14"
        currentStars={kid.pointsBalance}
        currentCash={kid.cashBalance}
      />
    </div>
  );
}
