"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function SearchBar({ initialQuery }: { initialQuery: string }) {
  const router = useRouter();
  const [value, setValue] = useState(initialQuery);

  return (
    <form
      role="search"
      onSubmit={(e) => {
        e.preventDefault();
        const q = value.trim();
        router.push(q ? `/search?q=${encodeURIComponent(q)}` : "/search");
      }}
      className="mt-6 flex max-w-md items-center gap-2 rounded-full border border-line bg-white px-4 py-1"
    >
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" className="shrink-0 text-slate">
        <circle cx="11" cy="11" r="7" />
        <path d="m20 20-3.2-3.2" />
      </svg>
      <input
        type="search"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Search designs, e.g. floral, peacock, mandala…"
        autoFocus
        className="h-11 flex-1 bg-transparent text-sm outline-none placeholder:text-slate"
      />
      <button type="submit" className="btn h-9 shrink-0 px-4 text-[0.75rem]">
        Search
      </button>
    </form>
  );
}
