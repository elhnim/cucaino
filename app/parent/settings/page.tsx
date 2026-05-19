import Link from "next/link";
import { redirect } from "next/navigation";
import { getFamily, listKids, getParentPinFromDb, listFamilyInvites } from "@/lib/data/stub";
import { getTheme } from "@/lib/themes/presets";
import { signOut } from "@/lib/actions/auth";
import FamilyNameEditor from "@/components/parent/FamilyNameEditor";
import WeatherLocationPicker from "@/components/parent/WeatherLocationPicker";
import InviteParentSection from "@/components/parent/InviteParentSection";

const commit = process.env.NEXT_PUBLIC_APP_VERSION ?? "dev";

function SettingsRow({
  icon,
  iconBg,
  label,
  value,
  href,
  danger,
}: {
  icon: string;
  iconBg: string;
  label: string;
  value?: string;
  href?: string;
  danger?: boolean;
}) {
  const inner = (
    <div className="flex items-center justify-between px-3.5 py-3.5 bg-white gap-2.5">
      <div className="flex items-center gap-2.5">
        <div
          className="w-8 h-8 rounded-[9px] flex items-center justify-center text-base flex-shrink-0"
          style={{ background: iconBg }}
        >
          {icon}
        </div>
        <div>
          <div className={`text-[14px] font-semibold ${danger ? "text-red-600" : "text-gray-800"}`}>{label}</div>
          {value && <div className="text-[12px] text-gray-400 font-medium">{value}</div>}
        </div>
      </div>
      <span className="text-gray-300 text-xl flex-shrink-0">›</span>
    </div>
  );

  if (href) {
    return <Link href={href} className="block border-b border-gray-100 last:border-none">{inner}</Link>;
  }
  return <div className="border-b border-gray-100 last:border-none">{inner}</div>;
}

export default async function ParentSettingsPage() {
  const [family, kids, invites] = await Promise.all([getFamily(), listKids(), listFamilyInvites()]);
  await getParentPinFromDb();

  if (!family) redirect("/login");

  return (
    <div className="p-4 space-y-5 pt-5">

      <h1 className="text-xl font-extrabold text-gray-900">⚙️ Settings</h1>

      {/* Family */}
      <div>
        <div className="text-[10px] font-extrabold uppercase tracking-widest text-gray-400 mb-2">Family</div>
        <div className="bg-white rounded-2xl overflow-hidden border-[1.5px] border-gray-200">
          {/* Editable family name inline */}
          <div className="px-3.5 py-3.5 border-b border-gray-100 flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-[9px] flex items-center justify-center text-base flex-shrink-0" style={{ background: "#ede9fe" }}>
              🏠
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[11px] text-gray-400 font-medium mb-0.5">Family name</div>
              <FamilyNameEditor initialName={family.name} />
            </div>
          </div>
          <Link
            href="/parent/profile"
            className="flex items-center gap-2.5 px-3.5 py-3 border-t border-gray-100 bg-white"
          >
            <div className="w-9 h-9 rounded-full flex items-center justify-center text-[18px] flex-shrink-0" style={{ background: "#fef3c7" }}>
              {family.parentAvatar}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[14px] font-semibold text-gray-800 truncate">
                {family.parentDisplayName || "Your profile"}
              </div>
              <div className="text-[11px] text-gray-400 font-medium">Parent / Guardian</div>
            </div>
            <span className="text-gray-300 text-xl">›</span>
          </Link>
          <div className="border-t border-gray-100 px-3.5 py-3.5">
            <div className="flex items-center gap-2.5 mb-3">
              <div className="w-9 h-9 rounded-full flex items-center justify-center text-[18px] flex-shrink-0 bg-indigo-50">
                ✉️
              </div>
              <div>
                <div className="text-[14px] font-semibold text-gray-800">Invite a parent or guardian</div>
                <div className="text-[11px] text-gray-400">They&apos;ll get full access to the parent dashboard</div>
              </div>
            </div>
            <InviteParentSection initialInvites={invites} />
          </div>
        </div>
      </div>

      {/* Kids */}
      <div>
        <div className="text-[10px] font-extrabold uppercase tracking-widest text-gray-400 mb-2">Kids</div>
        <div className="bg-white rounded-2xl overflow-hidden border-[1.5px] border-gray-200">
          {kids.map((kid) => {
            const theme = getTheme(kid.themeId);
            return (
              <Link
                key={kid.id}
                href={`/parent/kids/${kid.id}/edit`}
                className="flex items-center gap-2.5 px-3.5 py-3 border-b border-gray-100 last:border-none bg-white"
              >
                <div
                  className="w-9 h-9 rounded-full flex items-center justify-center text-[18px] flex-shrink-0"
                  style={{ background: theme.accentSoft }}
                >
                  {kid.avatar}
                </div>
                <div className="flex-1">
                  <div className="text-[14px] font-semibold text-gray-800">{kid.name}</div>
                  <div className="text-[12px] text-gray-400 font-medium">Age {kid.age} · {theme.name} theme</div>
                </div>
                <span className="text-gray-300 text-xl">›</span>
              </Link>
            );
          })}
          <Link
            href="/parent/kids/new"
            className="flex items-center gap-2.5 px-3.5 py-3 border-t border-gray-100 bg-white"
          >
            <div className="w-9 h-9 rounded-full flex items-center justify-center text-[18px] flex-shrink-0 bg-gray-100">
              ＋
            </div>
            <div className="text-[14px] font-semibold text-indigo-600">Add a kid</div>
            <span className="text-gray-300 text-xl ml-auto">›</span>
          </Link>
        </div>
      </div>

      {/* Preferences */}
      <div>
        <div className="text-[10px] font-extrabold uppercase tracking-widest text-gray-400 mb-2">Preferences</div>
        <div className="bg-white rounded-2xl overflow-hidden border-[1.5px] border-gray-200">
          <div className="px-3.5 py-3.5 border-b border-gray-100 flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-[9px] flex items-center justify-center text-base flex-shrink-0 bg-blue-50">🌍</div>
            <div className="flex-1">
              <label className="text-[14px] font-semibold text-gray-800">Timezone</label>
              <select defaultValue="Australia/Sydney" className="block w-full text-[12px] text-gray-400 border-none bg-transparent p-0 mt-0.5 focus:outline-none">
                <option value="Australia/Sydney">Australia/Sydney (AEST)</option>
                <option value="Australia/Melbourne">Australia/Melbourne (AEST)</option>
                <option value="Australia/Brisbane">Australia/Brisbane (AEST)</option>
                <option value="America/New_York">America/New York (EST)</option>
                <option value="America/Los_Angeles">America/Los Angeles (PST)</option>
                <option value="Europe/London">Europe/London (GMT)</option>
                <option value="UTC">UTC</option>
              </select>
            </div>
          </div>
          <div className="px-3.5 py-3.5 border-b border-gray-100 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-[9px] flex items-center justify-center text-base flex-shrink-0 bg-green-50">📅</div>
              <span className="text-[14px] font-semibold text-gray-800">Week starts on</span>
            </div>
            <div className="flex rounded-full overflow-hidden border border-gray-200 text-xs font-semibold">
              <button type="button" className="px-3 py-1 bg-indigo-600 text-white">Mon</button>
              <button type="button" className="px-3 py-1 bg-gray-100 text-gray-600">Sun</button>
            </div>
          </div>
          <div className="px-3.5 py-3.5 border-b border-gray-100 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-[9px] flex items-center justify-center text-base flex-shrink-0 bg-amber-50">🏖️</div>
              <div>
                <div className="text-[14px] font-semibold text-gray-800">Holiday mode</div>
                <div className="text-[11px] text-gray-400">Pauses all strict tasks</div>
              </div>
            </div>
            <div className="w-11 h-6 rounded-full bg-gray-200 relative flex-shrink-0">
              <div className="absolute left-0.5 top-0.5 w-5 h-5 rounded-full bg-white shadow" />
            </div>
          </div>
          <div className="px-3.5 py-3.5">
            <div className="flex items-center gap-2.5 mb-3">
              <div className="w-8 h-8 rounded-[9px] flex items-center justify-center text-base flex-shrink-0 bg-sky-50">🌤️</div>
              <div>
                <div className="text-[14px] font-semibold text-gray-800">Weather location</div>
                <div className="text-[11px] text-gray-400">Used to show weather in the kids header</div>
              </div>
            </div>
            <WeatherLocationPicker current={family.weatherCity} />
          </div>
        </div>
      </div>

      {/* App */}
      <div>
        <div className="text-[10px] font-extrabold uppercase tracking-widest text-gray-400 mb-2">App</div>
        <div className="bg-white rounded-2xl overflow-hidden border-[1.5px] border-gray-200">
          <Link href="/parent/feedback" className="flex items-center gap-2.5 px-3.5 py-3.5 border-b border-gray-100">
            <div className="w-8 h-8 rounded-[9px] flex items-center justify-center text-base flex-shrink-0 bg-indigo-50">💡</div>
            <span className="text-[14px] font-semibold text-gray-800">Send feedback</span>
            <span className="text-gray-300 text-xl ml-auto">›</span>
          </Link>
          <div className="flex items-center justify-between px-3.5 py-3">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-[9px] flex items-center justify-center text-base flex-shrink-0 bg-gray-100">ℹ️</div>
              <span className="text-[14px] font-semibold text-gray-800">Build</span>
            </div>
            <span className="font-mono text-xs text-gray-400">{commit.replace(/^dev-/, "")}</span>
          </div>
        </div>
      </div>

      {/* Sign out */}
      <form action={signOut}>
        <button
          type="submit"
          className="w-full rounded-2xl py-3.5 text-sm font-bold text-red-600 border-[1.5px] border-red-200 bg-red-50"
        >
          🚪 Sign out
        </button>
      </form>

    </div>
  );
}
