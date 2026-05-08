import Link from "next/link";
import { redirect } from "next/navigation";
import ParentShell from "@/components/parent/ParentShell";
import { getFamily, listKids, getParentPinFromDb } from "@/lib/data/stub";
import { getTheme } from "@/lib/themes/presets";
import { signOut } from "@/lib/actions/auth";

const commit = process.env.NEXT_PUBLIC_APP_VERSION ?? "dev";

export default async function ParentSettingsPage() {
  const [family, kids] = await Promise.all([getFamily(), listKids()]);
  // getParentPinFromDb kept available for future use
  await getParentPinFromDb();

  if (!family) redirect("/login");

  return (
    <ParentShell>
      <div className="p-4 space-y-6">

        {/* Section 1: Family */}
        <div className="bg-white rounded-2xl shadow p-4 space-y-4">
          {/* Family name */}
          <div>
            <div className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Family name</div>
            <div className="flex items-center justify-between">
              <span className="font-bold text-gray-900">{family.name}</span>
              <span className="text-base">✏️</span>
            </div>
          </div>

          {/* Kids list */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="font-bold text-gray-900">Kids</span>
              <Link
                href="/parent/kids"
                className="text-xs text-indigo-600 border border-indigo-300 rounded-lg px-2 py-1 font-semibold"
              >
                + Add
              </Link>
            </div>
            <div className="space-y-2">
              {kids.map((kid) => {
                const theme = getTheme(kid.themeId);
                return (
                  <Link key={kid.id} href="/parent/kids" className="flex items-center gap-3 bg-gray-50 rounded-xl p-3">
                    <div
                      className="w-10 h-10 rounded-full flex items-center justify-center text-xl flex-shrink-0"
                      style={{ backgroundColor: theme.accentSoft }}
                    >
                      {kid.avatar}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-bold text-gray-900 text-sm">{kid.name}</div>
                      <div className="text-xs text-gray-500">Age {kid.age}</div>
                    </div>
                    <span className="text-gray-400 text-lg">›</span>
                  </Link>
                );
              })}
            </div>
          </div>

          {/* Co-parents */}
          <div>
            <div className="font-bold text-gray-900 mb-2">Parents &amp; Guardians</div>
            <div className="border border-dashed border-gray-300 rounded-xl p-4 text-center space-y-2">
              <p className="text-sm text-gray-500">📨 Invite a co-parent/guardian</p>
              <button
                type="button"
                className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-2 rounded-lg text-sm"
              >
                Send Invite
              </button>
              <p className="text-xs text-gray-500">
                They&apos;ll get full access to manage tasks, rewards, and approvals
              </p>
            </div>
          </div>
        </div>

        {/* Section 2: Preferences */}
        <div className="bg-white rounded-2xl shadow p-4 space-y-4">
          {/* Timezone */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">Timezone</label>
            <select
              defaultValue="Australia/Sydney"
              className="border border-gray-300 rounded-lg p-2 w-full text-sm"
            >
              <option value="Australia/Sydney">Australia/Sydney</option>
              <option value="Australia/Melbourne">Australia/Melbourne</option>
              <option value="Australia/Brisbane">Australia/Brisbane</option>
            </select>
          </div>

          {/* Week starts on */}
          <div>
            <div className="text-sm font-semibold text-gray-700 mb-2">Week starts on</div>
            <div className="flex rounded-full overflow-hidden border border-gray-200 w-fit">
              <button type="button" className="px-4 py-1.5 text-sm font-semibold bg-indigo-600 text-white">
                Monday
              </button>
              <button type="button" className="px-4 py-1.5 text-sm font-semibold bg-gray-100 text-gray-600">
                Sunday
              </button>
            </div>
          </div>

          {/* Holiday mode */}
          <div>
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-gray-700 flex-1">Holiday mode 🏖️</span>
              {/* Visual toggle — off state */}
              <div className="w-11 h-6 rounded-full bg-gray-200 relative flex-shrink-0">
                <div className="absolute left-0.5 top-0.5 w-5 h-5 rounded-full bg-white shadow" />
              </div>
            </div>
            <p className="text-xs text-gray-500 mt-1">Pauses all strict tasks while away</p>
          </div>
        </div>

        {/* Section 3: App */}
        <div className="bg-white rounded-2xl shadow p-4 space-y-3">
          <div className="flex items-center justify-between text-sm">
            <span className="text-gray-600">Build</span>
            <span className="font-mono text-xs text-gray-500">{commit}</span>
          </div>

          <Link href="/parent/feedback" className="block text-sm text-indigo-600 font-semibold">
            💡 Send feedback
          </Link>

          <hr className="border-gray-100" />

          <form action={signOut}>
            <button
              type="submit"
              className="w-full bg-red-50 hover:bg-red-100 text-red-600 font-bold py-3 rounded-xl text-sm"
            >
              🚪 Sign out
            </button>
          </form>
        </div>

      </div>
    </ParentShell>
  );
}
