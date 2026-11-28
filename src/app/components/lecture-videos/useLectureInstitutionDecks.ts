"use client";
import { useEffect, useState } from "react";
import { listInstitutionBrandedDecksAction } from "@/app/actions/institution-branded-decks";
import type { InstitutionBrandedDeck } from "@/lib/institution-branded-decks";

export type LectureInstitutionDecks = {
  account: string;
  files: InstitutionBrandedDeck[];
  loading: boolean;
  error: string;
  refresh: () => void;
};

const emptyFiles: InstitutionBrandedDeck[] = [];

export function useLectureInstitutionDecks(account: string, active: boolean): LectureInstitutionDecks {
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<{ attempt: number; files: InstitutionBrandedDeck[]; error: string }>();
  useEffect(() => {
    if (!active) return;
    let current = true;
    void Promise.resolve().then(async () => {
      if (!current) return;
      const response = await listInstitutionBrandedDecksAction(account).catch(() => ({
        files: undefined, error: "Could not load institution slide decks. Try again.",
      }));
      if (!current) return;
      setResult({ attempt, files: response.files ?? [], error: response.error ?? "" });
    });
    return () => { current = false; };
  }, [account, active, attempt]);
  return {
    account, files: result?.files ?? emptyFiles, loading: result?.attempt !== attempt, error: result?.error ?? "",
    refresh: () => setAttempt((previous) => previous + 1),
  };
}
