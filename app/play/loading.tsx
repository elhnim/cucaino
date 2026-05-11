export default function Loading() {
  return (
    <div className="min-h-dvh bg-gray-50 p-4">
      <div className="max-w-lg mx-auto space-y-4 pt-4">
        <div className="h-8 bg-gray-200 rounded animate-pulse w-32" />
        {[...Array(3)].map((_, i) => (
          <div key={i} className="bg-white rounded-2xl shadow h-24 animate-pulse" />
        ))}
      </div>
    </div>
  );
}
