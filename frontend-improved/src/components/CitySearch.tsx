import { useState, useRef, useEffect, useCallback } from "react";
import { MapPin, Search, Loader2, X } from "lucide-react";
import { City } from "@/contexts/AppContext";

interface CitySearchProps {
  label: string;
  value: City | null;
  onSelect: (city: City | null) => void;
  placeholder?: string;
}

interface NominatimResult {
  place_id: number;
  display_name: string;
  lat: string;
  lon: string;
  type: string;
  address?: {
    city?: string;
    town?: string;
    village?: string;
    state?: string;
    country?: string;
  };
}

function getCityName(r: NominatimResult): string {
  return (
    r.address?.city ||
    r.address?.town ||
    r.address?.village ||
    r.display_name.split(",")[0]
  );
}

export default function CitySearch({
  label,
  value,
  onSelect,
  placeholder = "Search city...",
}: CitySearchProps) {
  const [query, setQuery] = useState(value?.name ?? "");
  const [results, setResults] = useState<NominatimResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const search = useCallback(async (q: string) => {
    if (q.trim().length < 2) {
      setResults([]);
      setOpen(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&addressdetails=1&limit=7`,
        { headers: { "Accept-Language": "en" } }
      );
      if (!res.ok) throw new Error("Search failed");
      const data: NominatimResult[] = await res.json();
      setResults(data);
      setOpen(data.length > 0);
    } catch {
      setError("Search unavailable. Please try again.");
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleInput = (val: string) => {
    setQuery(val);
    // If user clears the field, also clear the selected city
    if (!val.trim()) {
      onSelect(null);
      setResults([]);
      setOpen(false);
    }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => search(val), 400);
  };

  const handleSelect = (r: NominatimResult) => {
    const name = getCityName(r);
    const city: City = {
      name,
      lat: parseFloat(r.lat),
      lon: parseFloat(r.lon),
    };
    onSelect(city);
    setQuery(name);
    setOpen(false);
    setResults([]);
    setError(null);
  };

  const clear = () => {
    onSelect(null);
    setQuery("");
    setResults([]);
    setOpen(false);
    setError(null);
    inputRef.current?.focus();
  };

  // Sync external value changes (e.g., form reset)
  useEffect(() => {
    if (value) {
      setQuery(value.name);
    } else {
      setQuery("");
    }
  }, [value]);

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // Keyboard navigation
  const [highlighted, setHighlighted] = useState(-1);
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!open) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlighted((h) => Math.min(h + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlighted((h) => Math.max(h - 1, 0));
    } else if (e.key === "Enter" && highlighted >= 0) {
      e.preventDefault();
      handleSelect(results[highlighted]);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  };

  return (
    <div ref={containerRef} className="relative">
      <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </label>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground pointer-events-none" />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => handleInput(e.target.value)}
          onFocus={() => results.length > 0 && setOpen(true)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          autoComplete="off"
          className="w-full rounded-md border bg-card py-2.5 pl-9 pr-9 text-sm text-foreground shadow-sm outline-none transition-all placeholder:text-muted-foreground focus:border-primary focus:ring-2 focus:ring-primary/20"
          aria-label={label}
          aria-autocomplete="list"
          aria-expanded={open}
        />
        {loading && (
          <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />
        )}
        {value && !loading && (
          <button
            onClick={clear}
            className="absolute right-3 top-1/2 -translate-y-1/2 rounded text-muted-foreground hover:text-foreground transition-colors"
            aria-label="Clear selection"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Error */}
      {error && (
        <p className="mt-1 text-xs text-destructive">{error}</p>
      )}

      {/* Selected city coords */}
      {value && !open && (
        <p className="mt-1 flex items-center gap-1 text-[11px] text-muted-foreground">
          <MapPin className="h-3 w-3" />
          {value.lat.toFixed(4)}, {value.lon.toFixed(4)}
        </p>
      )}

      {/* Dropdown */}
      {open && results.length > 0 && (
        <ul
          className="absolute z-50 mt-1 max-h-60 w-full overflow-auto rounded-md border bg-card py-1 shadow-lg"
          role="listbox"
        >
          {results.map((r, i) => (
            <li
              key={r.place_id}
              onClick={() => handleSelect(r)}
              onMouseEnter={() => setHighlighted(i)}
              className={`flex cursor-pointer items-start gap-2 px-3 py-2 text-sm transition-colors ${
                highlighted === i ? "bg-primary/10 text-primary" : "text-foreground hover:bg-muted"
              }`}
              role="option"
              aria-selected={highlighted === i}
            >
              <MapPin className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-primary" />
              <div className="min-w-0">
                <p className="font-medium truncate">{getCityName(r)}</p>
                <p className="truncate text-xs text-muted-foreground">{r.display_name}</p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
