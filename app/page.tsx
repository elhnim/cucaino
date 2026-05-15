import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ code?: string }>;
}) {
  const { code } = await searchParams;
  if (code) redirect(`/auth/callback?code=${encodeURIComponent(code)}`);

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (user) redirect("/select-kid");

  return <LandingPage />;
}

function LandingPage() {
  return (
    <div className="font-fun text-gray-900 bg-white">

      {/* ── FOUNDING BANNER ── */}
      <div className="bg-orange-500 text-white text-center py-2.5 px-5 text-sm font-bold">
        ⚡ 20 families get Cucaino free — forever. 3 spots remaining.
      </div>

      {/* ── NAV ── */}
      <nav className="sticky top-0 z-50 bg-white border-b border-gray-200 flex items-center justify-between px-[5%] py-4">
        <span className="text-2xl font-black text-indigo-900 tracking-tight">Cucaino</span>
        <div className="flex items-center gap-6">
          <Link href="#features" className="hidden sm:block text-gray-500 font-semibold text-sm hover:text-indigo-900">Features</Link>
          <Link href="#how" className="hidden sm:block text-gray-500 font-semibold text-sm hover:text-indigo-900">How it works</Link>
          <Link href="/login" className="text-gray-500 font-semibold text-sm hover:text-indigo-900">Sign in</Link>
          <Link href="/signup" className="bg-orange-500 hover:bg-orange-600 text-white font-black text-sm px-5 py-2.5 rounded-full">
            Get free access →
          </Link>
        </div>
      </nav>

      {/* ── HERO ── */}
      <section className="bg-gradient-to-br from-indigo-100 via-purple-50 to-pink-100 px-[5%] py-16 md:py-20">
        <div className="max-w-6xl mx-auto grid md:grid-cols-2 gap-12 items-center">

          {/* Left */}
          <div>
            <div className="inline-flex items-center gap-2 bg-white text-indigo-700 font-extrabold text-xs px-4 py-2 rounded-full shadow-sm mb-6">
              ✨ The habit-building app for kids
            </div>
            <h1 className="text-4xl md:text-5xl font-black text-indigo-950 leading-[1.1] tracking-tight mb-5">
              Raise a kid who<br />doesn&apos;t need <span className="text-indigo-600">reminding.</span>
            </h1>
            <p className="text-indigo-700 font-semibold text-lg leading-relaxed mb-8 max-w-md">
              Mornings without the battle. Piano practice that actually happens. A child who does the right thing — because it&apos;s just who they are now.
            </p>
            <Link
              href="/signup"
              className="inline-flex items-center gap-2 bg-orange-500 hover:bg-orange-600 text-white font-black text-lg px-8 py-4 rounded-full shadow-lg shadow-orange-200"
            >
              Claim your founding spot — free forever →
            </Link>
            <div className="flex gap-5 mt-4 text-sm font-semibold text-indigo-700">
              <span className="before:content-['✓_'] before:text-green-500">Free forever for the first 20 families</span>
              <span className="before:content-['✓_'] before:text-green-500">No credit card required</span>
            </div>
          </div>

          {/* Right — tablet mockup */}
          <div className="flex justify-center">
            <div className="bg-indigo-950 rounded-[28px] p-3.5 shadow-2xl shadow-indigo-900/30 w-[340px]">
              <div className="bg-gray-100 rounded-2xl overflow-hidden">
                {/* App bar */}
                <div className="bg-gradient-to-r from-indigo-700 to-indigo-600 px-4 py-3.5 flex justify-between items-center">
                  <span className="text-white font-extrabold text-sm">Hey, Lily 👋</span>
                  <span className="bg-white/20 text-white text-xs font-extrabold px-3 py-1 rounded-full">⭐ 240 pts</span>
                </div>
                {/* Streak bar */}
                <div className="bg-orange-50 border-b border-orange-200 px-4 py-2.5 flex items-center gap-2">
                  <span className="text-lg">🔥</span>
                  <span className="text-orange-900 text-xs font-extrabold">14-day streak — You&apos;re becoming a musician!</span>
                </div>
                {/* Section head */}
                <div className="bg-white border-b border-gray-200 px-4 py-3">
                  <p className="text-gray-500 text-xs font-semibold">Thursday morning</p>
                  <h3 className="text-indigo-950 font-black text-sm">3 habits to go</h3>
                </div>
                {/* Habit rows */}
                <div className="p-3 flex flex-col gap-2">
                  <HabitRow icon="🎒" name="Pack school bag" done />
                  <HabitRow icon="🥣" name="Breakfast + teeth" done />
                  <HabitRow icon="🎹" name="Piano practice" streak="🔥 14" />
                  <HabitRow icon="📖" name="Reading (10 min)" streak="🔥 7" />
                </div>
                {/* Practice card */}
                <div className="mx-3 mb-3 bg-gradient-to-br from-indigo-700 to-purple-700 rounded-2xl p-3.5 text-white">
                  <p className="text-xs font-bold opacity-75 mb-1">TODAY&apos;S PRACTICE</p>
                  <p className="text-sm font-black mb-2.5">🎹 Piano · 15 min timer</p>
                  <div className="bg-white/20 rounded h-1.5">
                    <div className="bg-orange-400 rounded h-1.5 w-[58%]" />
                  </div>
                  <div className="flex justify-between mt-1.5 text-[11px] font-bold opacity-80">
                    <span>9 min done</span>
                    <span>6 min left</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

        </div>
      </section>

      {/* ── PAIN ── */}
      <section className="bg-white px-[5%] py-16 text-center">
        <p className="text-indigo-600 font-extrabold text-xs uppercase tracking-widest mb-3">You know this feeling</p>
        <h2 className="text-3xl md:text-4xl font-black text-indigo-950 tracking-tight mb-3">
          You love them.<br />You&apos;re exhausted.
        </h2>
        <p className="text-gray-500 font-semibold mb-12">Nagging doesn&apos;t build character. It just drains yours.</p>
        <div className="grid md:grid-cols-3 gap-5 max-w-4xl mx-auto">
          <PainCard emoji="😤" title="It's 5:47pm. They still haven't practiced."
            body="You asked at 4. Again at 5. The piano is right there. You can hear your voice getting louder — and you hate the person this daily battle is turning you into." />
          <PainCard emoji="🌪️" title="It's 8:33am. School starts in 12 minutes."
            body="One shoe is missing. The lunch isn't packed. Someone's still in pyjamas watching YouTube. You're in full survival mode and the day hasn't even started." />
          <PainCard emoji="📱" title="You've tried the apps. They work for three weeks."
            body="Then the points stop feeling exciting. The reminders pile up. You're back where you started — except now you feel guilty for giving up on the app too." />
        </div>
      </section>

      {/* ── FEATURES ── */}
      <section id="features" className="bg-gradient-to-br from-indigo-100 via-purple-50 to-pink-100 px-[5%] py-16">
        <div className="max-w-5xl mx-auto">
          <p className="text-indigo-600 font-extrabold text-xs uppercase tracking-widest text-center mb-3">How it works</p>
          <h2 className="text-3xl md:text-4xl font-black text-indigo-950 tracking-tight text-center mb-3">
            The doing is the tracking.<br />No logging. No nagging.
          </h2>
          <p className="text-gray-500 font-semibold text-center mb-12 max-w-lg mx-auto">
            Built on one insight: the best habit app disappears. Your child does the thing. The habit builds itself.
          </p>
          <div className="grid md:grid-cols-3 gap-5">
            <FeatureCard icon="🌅" title="Mornings that run themselves"
              body="Your child opens the app, sees exactly what's next, and does it. Bag. Breakfast. Teeth. Out the door — calm, on time, proud of themselves. You drink your coffee while it's still hot." />
            <FeatureCard icon="🎹" title="Practice that actually happens"
              body="A timer they start themselves. A streak they fight to protect. The argument you've had every evening for months — quietly disappears." />
            <FeatureCard icon="🔥" title="Habits that become identity"
              body={"After 14 days of practice, Cucaino tells your child: \"You're becoming a musician.\" Identity beats willpower every time. James Clear proved it. We built it for kids."} />
            <FeatureCard icon="📱" title="Screen time as the reward"
              body="Games and quizzes unlock after habits are done. Your child stops fighting for screen time — because they know the deal. You stop guarding it. Everyone breathes." />
            <FeatureCard icon="🏆" title="Rewards they actually want"
              body="A sleepover. A treat. Extra screen time. You set the rewards. They earn them honestly. No gaming the system — the habit has to happen first." />
            <FeatureCard icon="📲" title="The 30 seconds that matter most"
              body={"Your phone lights up: \"Lily finished her practice. 14-day streak 🔥\" You send a heart. She sees it on her screen. Small moment. Massive impact."} />
          </div>
        </div>
      </section>

      {/* ── HOW IT WORKS ── */}
      <section id="how" className="bg-indigo-950 px-[5%] py-16 text-white text-center">
        <p className="text-white/50 font-extrabold text-xs uppercase tracking-widest mb-3">Getting started</p>
        <h2 className="text-3xl md:text-4xl font-black tracking-tight mb-3">Five minutes to set up.<br />A lifetime of payoff.</h2>
        <p className="text-white/60 font-semibold mb-12">No complicated onboarding. You&apos;ll be done before your coffee gets cold.</p>
        <div className="grid md:grid-cols-3 gap-5 max-w-4xl mx-auto">
          <StepCard num={1} title="Set your family's habits"
            body="Add your kids. Pick their habits — morning routine, practice, reading. Five minutes. You'll rarely need to touch it again." />
          <StepCard num={2} title="Your kids run their own day"
            body="They open the tablet. They see what's next. They do it. No parent required. No reminders. No arguments." />
          <StepCard num={3} title="Watch them become who you knew they could be"
            body="Thirty days in, you'll notice it. They're not waiting to be asked anymore. That's the moment every parent is working towards." />
        </div>
      </section>

      {/* ── FOUNDING OFFER ── */}
      <section className="bg-white px-[5%] py-16 text-center">
        <span className="inline-block bg-orange-50 border-2 border-orange-500 text-orange-500 font-black text-xs uppercase tracking-wide px-5 py-1.5 rounded-full mb-6">
          ⚡ Founding Family Offer
        </span>
        <h2 className="text-4xl md:text-5xl font-black text-indigo-950 tracking-tight leading-tight mb-5">
          Twenty families.<br />Free forever.<br />This is that moment.
        </h2>
        <p className="text-gray-500 font-semibold text-lg max-w-lg mx-auto mb-8 leading-relaxed">
          We&apos;re building Cucaino alongside 20 founding families who help shape what it becomes. Your feedback shapes the roadmap. Your family gets the app free — forever. Not a trial. Not a promotional period. <strong className="text-gray-700">Forever.</strong>
        </p>
        {/* Spots counter */}
        <div className="inline-flex items-center gap-4 bg-indigo-50 border-2 border-indigo-200 rounded-2xl px-6 py-3.5 mb-8 font-extrabold text-indigo-900 text-sm">
          <span>Spots claimed:</span>
          <div className="flex gap-1.5">
            {[...Array(10)].map((_, i) => (
              <div key={i} className={`w-3 h-3 rounded-full ${i < 3 ? "bg-indigo-500" : "bg-gray-200"}`} />
            ))}
          </div>
          <span>3 of 20 claimed</span>
        </div>
        <br />
        <Link
          href="/signup"
          className="inline-flex items-center gap-2 bg-orange-500 hover:bg-orange-600 text-white font-black text-xl px-10 py-5 rounded-full shadow-lg shadow-orange-200"
        >
          I want to be a founding family →
        </Link>
        <p className="text-gray-400 font-semibold text-sm mt-4">
          After 20 families, Cucaino is $10/month. No credit card needed today.
        </p>
      </section>

      {/* ── FOOTER ── */}
      <footer className="bg-gray-100 border-t border-gray-200 px-[5%] py-7 flex flex-col sm:flex-row justify-between items-center gap-4 text-sm font-semibold text-gray-500">
        <span className="text-xl font-black text-indigo-900">Cucaino</span>
        <span>© 2026 Cucaino. Built by a parent, for parents.</span>
        <div className="flex gap-5">
          <Link href="/login" className="hover:text-indigo-900">Sign in</Link>
          <Link href="/signup" className="hover:text-indigo-900">Sign up</Link>
          <a href="mailto:hello@cucaino.com" className="hover:text-indigo-900">Contact</a>
        </div>
      </footer>

    </div>
  );
}

// ── Sub-components ──

function HabitRow({ icon, name, done, streak }: { icon: string; name: string; done?: boolean; streak?: string }) {
  return (
    <div className={`flex items-center gap-2.5 rounded-2xl px-3 py-2.5 border ${done ? "bg-green-50 border-green-200" : "bg-white border-gray-200"}`}>
      <span className="text-xl">{icon}</span>
      <span className={`flex-1 text-xs font-bold ${done ? "line-through text-gray-400" : "text-indigo-950"}`}>{name}</span>
      {streak && <span className="text-orange-500 text-xs font-extrabold">{streak}</span>}
      <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center text-[10px] shrink-0 ${done ? "bg-green-500 border-green-500 text-white" : "border-gray-300"}`}>
        {done ? "✓" : ""}
      </div>
    </div>
  );
}

function PainCard({ emoji, title, body }: { emoji: string; title: string; body: string }) {
  return (
    <div className="bg-gradient-to-br from-indigo-100 to-purple-50 rounded-3xl p-7 text-left">
      <div className="text-3xl mb-3">{emoji}</div>
      <h4 className="text-indigo-950 font-extrabold text-base mb-2">{title}</h4>
      <p className="text-indigo-700 font-semibold text-sm leading-relaxed">{body}</p>
    </div>
  );
}

function FeatureCard({ icon, title, body }: { icon: string; title: string; body: string }) {
  return (
    <div className="bg-white rounded-3xl p-7" style={{ boxShadow: "0 4px 16px rgba(99,102,241,0.08)" }}>
      <div className="text-3xl mb-3">{icon}</div>
      <h3 className="text-indigo-950 font-extrabold text-base mb-2">{title}</h3>
      <p className="text-gray-600 font-semibold text-sm leading-relaxed">{body}</p>
    </div>
  );
}

function StepCard({ num, title, body }: { num: number; title: string; body: string }) {
  return (
    <div className="bg-white/10 rounded-3xl p-8">
      <div className="w-11 h-11 bg-orange-500 rounded-full flex items-center justify-center text-white font-black text-lg mx-auto mb-4">{num}</div>
      <h4 className="font-extrabold text-base mb-2">{title}</h4>
      <p className="text-white/70 font-semibold text-sm leading-relaxed">{body}</p>
    </div>
  );
}
