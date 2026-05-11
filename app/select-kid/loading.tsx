export default function Loading() {
  return (
    <div className="min-h-dvh bg-gray-50 p-6">
      <div className="max-w-2xl mx-auto space-y-6">
        <div className="h-8 bg-gray-200 rounded animate-pulse w-48 mx-auto" />
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="bg-white rounded-2xl shadow aspect-square animate-pulse" />
          ))}
        </div>
      </div>
    </div>
  );
}
