"use client";

export default function SelectKidError({ reset }: { error: Error; reset: () => void }) {
  return (
    <div
      className="fixed inset-0 z-[100] flex flex-col items-center justify-center text-center px-6"
      style={{ background: "linear-gradient(180deg, #4cc9ff 0%, #9f8bff 52%, #ffb46b 100%)" }}
    >
      <div className="text-7xl mb-4">😴</div>
      <h1 className="text-2xl font-black text-white mb-2" style={{ textShadow: "0 2px 0 rgba(46,16,101,.35)" }}>
        Couldn&apos;t reach the app
      </h1>
      <p className="text-white/90 font-semibold mb-6 max-w-xs">
        The connection took too long. It might just be waking up — let&apos;s try again.
      </p>
      <button
        type="button"
        onClick={reset}
        className="px-8 py-3.5 rounded-2xl font-black text-indigo-700 text-lg bg-white shadow active:scale-95 transition-transform"
      >
        Try again 🔄
      </button>
    </div>
  );
}
