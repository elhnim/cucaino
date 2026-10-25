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
      <div className="flex-1 p-4 overflow-auto">
        <div className="grid grid-cols-5 gap-2 mb-3">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-8 bg-gray-200 rounded-lg animate-pulse" />
          ))}
        </div>
        <div className="space-y-2">
          {[...Array(8)].map((_, i) => (
            <div key={i} className="grid grid-cols-5 gap-2">
              {[...Array(5)].map((_, j) => (
                <div key={j} className="h-14 bg-white rounded-xl shadow animate-pulse" />
              ))}
            </div>
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
