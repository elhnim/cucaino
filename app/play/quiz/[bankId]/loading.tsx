export default function Loading() {
  return (
    <div className="min-h-dvh bg-gray-50 p-4">
      <div className="max-w-lg mx-auto space-y-4 pt-4">
        <div className="h-4 bg-gray-200 rounded-full animate-pulse w-full" />
        <div className="bg-white rounded-2xl shadow p-6 h-32 animate-pulse" />
        <div className="space-y-3">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-14 bg-white rounded-2xl shadow animate-pulse" />
          ))}
        </div>
      </div>
    </div>
  );
}
