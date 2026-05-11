export default function Loading() {
  return (
    <div className="flex flex-col min-h-dvh bg-gray-50">
      <div className="flex items-center gap-3 px-4 py-3 bg-white shadow-sm border-b">
        <div className="w-10 h-10 rounded-full bg-gray-200 animate-pulse" />
        <div className="flex-1 h-4 rounded-full bg-gray-200 animate-pulse max-w-[100px]" />
        <div className="flex items-center gap-1">
          <div className="w-4 h-4 rounded bg-gray-200 animate-pulse" />
          <div className="w-10 h-4 rounded bg-gray-200 animate-pulse" />
        </div>
      </div>
      <div className="flex-1 p-4 space-y-6 overflow-auto">
        <div className="flex flex-col items-center gap-3 pt-4">
          <div className="w-24 h-24 rounded-full bg-gray-200 animate-pulse" />
          <div className="h-5 bg-gray-200 rounded animate-pulse w-28" />
        </div>
        <div className="space-y-4">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="space-y-1">
              <div className="h-3 bg-gray-200 rounded animate-pulse w-20" />
              <div className="h-10 bg-gray-200 rounded-xl animate-pulse w-full" />
            </div>
          ))}
        </div>
        <div className="flex gap-3">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="w-10 h-10 rounded-full bg-gray-200 animate-pulse" />
          ))}
        </div>
      </div>
      <div className="flex justify-around items-center py-2 px-6 bg-white border-t">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="flex flex-col items-center gap-1">
            <div className="w-8 h-8 rounded-xl bg-gray-200 animate-pulse" />
            <div className="w-10 h-2 rounded bg-gray-200 animate-pulse" />
          </div>
        ))}
      </div>
    </div>
  );
}
