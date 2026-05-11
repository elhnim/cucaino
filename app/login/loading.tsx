export default function Loading() {
  return (
    <div className="min-h-dvh flex items-center justify-center bg-gray-50 p-4">
      <div className="w-full max-w-sm space-y-5">
        <div className="h-10 bg-gray-200 rounded animate-pulse w-32 mx-auto" />
        <div className="bg-white rounded-2xl shadow p-6 space-y-4">
          {[...Array(2)].map((_, i) => (
            <div key={i} className="space-y-1">
              <div className="h-3 bg-gray-200 rounded animate-pulse w-16" />
              <div className="h-10 bg-gray-200 rounded-xl animate-pulse w-full" />
            </div>
          ))}
          <div className="h-12 bg-gray-200 rounded-2xl animate-pulse w-full" />
        </div>
      </div>
    </div>
  );
}
