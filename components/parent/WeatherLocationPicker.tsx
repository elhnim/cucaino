"use client";

import { useState, useTransition } from "react";
import { updateWeatherLocation } from "@/lib/actions/parent-settings";

type GeoResult = { name: string; country: string; latitude: number; longitude: number };

export default function WeatherLocationPicker({ current }: { current: string | null }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<GeoResult[]>([]);
  const [saved, setSaved] = useState(current);
  const [isPending, startTransition] = useTransition();

  const search = async () => {
    if (!query.trim()) return;
    const res = await fetch(
      `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(query)}&count=5`
    );
    const json = await res.json();
    setResults(json.results ?? []);
  };

  const pick = (r: GeoResult) => {
    startTransition(async () => {
      await updateWeatherLocation(r.name, r.latitude, r.longitude);
      setSaved(`${r.name}, ${r.country}`);
      setResults([]);
      setQuery("");
    });
  };

  return (
    <div>
      {saved && (
        <p className="text-sm text-gray-600 mb-2">
          📍 Current: <strong>{saved}</strong>
        </p>
      )}
      <div className="flex gap-2">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); search(); } }}
          placeholder="Search city…"
          className="flex-1 border rounded-lg px-3 py-2 text-sm"
        />
        <button
          type="button"
          onClick={search}
          className="bg-indigo-100 text-indigo-700 font-bold text-sm px-4 py-2 rounded-lg hover:bg-indigo-200 transition-colors"
        >
          Search
        </button>
      </div>
      {results.length > 0 && (
        <ul className="mt-2 bg-white border rounded-xl overflow-hidden shadow text-sm">
          {results.map((r, i) => (
            <li key={i}>
              <button
                type="button"
                disabled={isPending}
                onClick={() => pick(r)}
                className="w-full text-left px-4 py-2 hover:bg-indigo-50 disabled:opacity-50 transition-colors"
              >
                {r.name}, {r.country}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
