export default function Loading() {
  return (
    <div className="p-4 space-y-6">
      {[...Array(3)].map((_, i) => (
        <div key={i} className="space-y-3">
          <div className="h-4 bg-gray-200 rounded animate-pulse w-28" />
          {[...Array(3)].map((_, j) => (
            <div key={j} className="bg-white rounded-2xl shadow h-14 animate-pulse" />
          ))}
        </div>
      ))}
    </div>
  );
}
