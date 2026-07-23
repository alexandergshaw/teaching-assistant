import { useCallback, useEffect, useState } from "react";

interface UseRepoSelectionOptions {
  repos: string[];
}

export function useRepoSelection({ repos }: UseRepoSelectionOptions) {
  const [filterText, setFilterText] = useState(() =>
    typeof window !== "undefined" ? localStorage.getItem("ta-vc-bulk-filter") ?? "" : ""
  );
  const [selectedRepos, setSelectedRepos] = useState<Set<string>>(() => {
    if (typeof window === "undefined") return new Set();
    const stored = localStorage.getItem("ta-vc-bulk-repos");
    if (!stored) return new Set();
    try {
      const parsed = JSON.parse(stored) as string[];
      const valid = parsed.filter((r) => repos.includes(r));
      return new Set(valid);
    } catch {
      return new Set();
    }
  });

  useEffect(() => {
    if (typeof window !== "undefined") localStorage.setItem("ta-vc-bulk-filter", filterText);
  }, [filterText]);

  useEffect(() => {
    if (typeof window !== "undefined") {
      localStorage.setItem("ta-vc-bulk-repos", JSON.stringify([...selectedRepos]));
    }
  }, [selectedRepos]);

  const shown = repos.filter((r) => !filterText.trim() || r.toLowerCase().includes(filterText.trim().toLowerCase()));
  const allShownSelected = shown.length > 0 && shown.every((r) => selectedRepos.has(r));

  const handleSelectAll = useCallback(() => {
    if (allShownSelected) {
      setSelectedRepos((prev) => {
        const next = new Set(prev);
        for (const r of shown) next.delete(r);
        return next;
      });
    } else {
      setSelectedRepos((prev) => {
        const next = new Set(prev);
        for (const r of shown) next.add(r);
        return next;
      });
    }
  }, [allShownSelected, shown]);

  const handleClear = useCallback(() => {
    setSelectedRepos(new Set());
  }, []);

  return {
    filterText,
    setFilterText,
    selectedRepos,
    setSelectedRepos,
    shown,
    allShownSelected,
    handleSelectAll,
    handleClear,
  };
}
