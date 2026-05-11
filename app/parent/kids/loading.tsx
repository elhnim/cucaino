export default function Loading() {
  return (
    <div className="p-4 space-y-3">
      {[...Array(5)].map((_, i) => (
        <div key={i} className="bg-white rounded-2xl shadow h-16 animate-pulse" />
      ))}
    </div>
  );
}
