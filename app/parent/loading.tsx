export default function ParentLoading() {
  return (
    <div className="p-4 space-y-3">
      {[1, 2, 3, 4].map((i) => (
        <div key={i} className="bg-white rounded-2xl shadow h-20 animate-pulse" />
      ))}
    </div>
  );
}
