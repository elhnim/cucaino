import { notFound } from "next/navigation";
import { getKid, listKidHistory, listCashTransactions, listKids } from "@/lib/data/stub";
import { getTheme } from "@/lib/themes/presets";
import HistoryTabs from "@/components/kid/HistoryTabs";
import CashTransactionButton from "@/components/parent/CashTransactionButton";

export default async function ParentKidHistoryPage({
  params,
  searchParams,
}: {
  params: Promise<{ kidId: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const { kidId } = await params;
  const { tab } = await searchParams;

  const [kid, entries, cashTxns, allKids] = await Promise.all([
    getKid(kidId),
    listKidHistory(kidId, 30),
    listCashTransactions(kidId, 30),
    listKids(),
  ]);
  if (!kid) notFound();

  const theme = getTheme(kid.themeId);

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div
            className="w-10 h-10 rounded-full flex items-center justify-center text-2xl flex-shrink-0"
            style={{ background: theme.accentSoft }}
          >
            {kid.avatar}
          </div>
          <div>
            <h2 className="text-lg font-black">{kid.name}&apos;s History</h2>
            <p className="text-xs text-gray-400">Last 30 days</p>
          </div>
        </div>
        <CashTransactionButton kids={allKids} defaultKidId={kid.id} />
      </div>

      <HistoryTabs
        entries={entries}
        cashTxns={cashTxns}
        theme={theme}
        initialTab={(tab === "cash" ? "cash" : "stars") as "stars" | "cash"}
        emptyDaysLabel="30"
        currentStars={kid.pointsBalance}
        currentCash={kid.cashBalance}
      />
    </div>
  );
}
