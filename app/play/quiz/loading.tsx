export default function Loading() {
  return (
    <div className="min-h-dvh bg-gray-50 p-4">
      <div className="max-w-lg mx-auto space-y-4 pt-4">
        <div className="h-7 bg-gray-200 rounded animate-pulse w-40" />
        <div className="flex gap-2 flex-wrap">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-8 w-20 bg-gray-200 rounded-full animate-pulse" />
          ))}
        </div>
        {[...Array(4)].map((_, i) => (
          <div key={i} className="bg-white rounded-2xl shadow h-20 animate-pulse" />
        ))}
      </div>
    </div>
  );
}
