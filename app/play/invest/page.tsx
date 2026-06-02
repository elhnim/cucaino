import {
  ensureInvestAccount,
  ensureInvestLicence,
  getKid,
  getKidInvestingEnabled,
  getTodayRealPrices,
  listInvestHoldings,
  listInvestTransactions,
} from "@/lib/data/stub";
import { createClient } from "@/lib/supabase/server";
import { REAL_ASSETS } from "@/lib/invest/assets";
import { ensureDailyRealPrices } from "@/lib/invest/prices";
import KidShell from "@/components/kid/KidShell";
import InvestHub from "@/components/invest/InvestHub";

export default async function InvestPage({ searchParams }: { searchParams: Promise<{ kid?: string }> }) {
  const { kid: kidId } = await searchParams;
  const kid = kidId ? await getKid(kidId) : null;
  const enabled = kid ? await getKidInvestingEnabled(kid.id) : false;

  if (!kid || !enabled) {
    const locked = (
      <div className="min-h-full bg-slate-50 px-4 py-8">
        <div className="mx-auto max-w-lg rounded-[14px] border border-slate-200 bg-white p-6 text-center shadow-sm">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-indigo-50 text-3xl">🔒</div>
          <h1 className="text-2xl font-black text-slate-950">Investing is locked</h1>
          <p className="mt-2 text-sm font-semibold text-slate-500">Ask a parent to turn on Invest when your family is ready for real cash ups and downs.</p>
        </div>
      </div>
    );
    return kid ? <KidShell kid={kid} active="play">{locked}</KidShell> : locked;
  }

  const supabase = await createClient();
  void ensureDailyRealPrices(supabase);

  const [account, licence, holdings, transactions, prices] = await Promise.all([
    ensureInvestAccount(kid.id),
    ensureInvestLicence(kid.id),
    listInvestHoldings(kid.id),
    listInvestTransactions(kid.id, 30),
    getTodayRealPrices(),
  ]);

  const content = (
    <InvestHub
      kid={{ id: kid.id, name: kid.name, cashBalance: kid.cashBalance }}
      account={account}
      licence={licence}
      holdings={holdings}
      transactions={transactions}
      prices={prices}
      assets={REAL_ASSETS}
    />
  );

  return <KidShell kid={kid} active="play">{content}</KidShell>;
}
