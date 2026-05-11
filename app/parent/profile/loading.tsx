export default function Loading() {
  return (
    <div className="p-4 max-w-lg mx-auto space-y-5">
      <div className="h-7 bg-gray-200 rounded animate-pulse w-32" />
      {[...Array(4)].map((_, i) => (
        <div key={i} className="space-y-1">
          <div className="h-3 bg-gray-200 rounded animate-pulse w-24" />
          <div className="h-10 bg-gray-200 rounded-xl animate-pulse w-full" />
        </div>
      ))}
      <div className="h-12 bg-gray-200 rounded-2xl animate-pulse w-full" />
    </div>
  );
}
