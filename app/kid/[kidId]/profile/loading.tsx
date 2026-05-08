export default function ProfileLoading() {
  return (
    <div className="min-h-screen bg-white">
      {/* Nav shell skeleton */}
      <div className="h-16 bg-white border-b border-gray-100 flex items-center px-4 gap-3 animate-pulse">
        <div className="w-10 h-10 rounded-full bg-gray-200" />
        <div className="flex-1" />
        <div className="w-24 h-4 bg-gray-200 rounded-full" />
      </div>

      <div className="p-4 md:p-6 max-w-lg mx-auto space-y-6 animate-pulse">
        {/* Avatar + name */}
        <div className="flex flex-col items-center gap-3 pt-4">
          <div className="w-24 h-24 rounded-full bg-gray-200" />
          <div className="w-32 h-5 bg-gray-200 rounded-full" />
          <div className="w-20 h-3 bg-gray-100 rounded-full" />
        </div>

        {/* Stars bar */}
        <div className="h-12 bg-gray-100 rounded-2xl" />

        {/* Fields */}
        <div className="space-y-3">
          <div className="h-14 bg-gray-100 rounded-2xl" />
          <div className="h-14 bg-gray-100 rounded-2xl" />
          <div className="h-14 bg-gray-100 rounded-2xl" />
        </div>

        {/* Save button */}
        <div className="h-12 bg-gray-200 rounded-2xl" />
      </div>

      {/* Bottom nav skeleton */}
      <div className="fixed bottom-0 inset-x-0 h-16 bg-white border-t border-gray-100 flex items-center justify-around px-4 animate-pulse">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="flex flex-col items-center gap-1">
            <div className="w-6 h-6 bg-gray-200 rounded" />
            <div className="w-10 h-2 bg-gray-100 rounded-full" />
          </div>
        ))}
      </div>
    </div>
  );
}
