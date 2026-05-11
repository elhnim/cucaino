export default function Loading() {
  return (
    <div className="p-4 space-y-4">
      <div className="flex gap-2">
        <div className="h-9 w-32 bg-gray-200 rounded-full animate-pulse" />
        <div className="h-9 w-28 bg-gray-200 rounded-full animate-pulse" />
      </div>
      {[...Array(4)].map((_, i) => (
        <div key={i} className="bg-white rounded-2xl shadow h-20 animate-pulse" />
      ))}
    </div>
  );
}
