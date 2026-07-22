"use client";

import { useEffect, useRef, useState } from "react";

export interface UseTitleCardsReturn {
  cardsOn: boolean;
  setCardsOn: (value: boolean) => void;
  cardTitle: string;
  setCardTitle: (value: string) => void;
  cardSubtitle: string;
  setCardSubtitle: (value: string) => void;
  cardClosing: string;
  setCardClosing: (value: string) => void;
  cardSeconds: "2" | "3" | "5";
  setCardSeconds: (value: "2" | "3" | "5") => void;
  cardBg: string;
  setCardBg: (value: string) => void;
  cardText: string;
  setCardText: (value: string) => void;
  cardNotice: { kind: "title" | "closing"; secondsLeft: number } | null;
  setCardNotice: React.Dispatch<React.SetStateAction<{ kind: "title" | "closing"; secondsLeft: number } | null>>;
  cardNoticeTimerRef: React.MutableRefObject<ReturnType<typeof setInterval> | null>;
  cardPhaseRef: React.MutableRefObject<"title" | "closing" | null>;
  cardTitleRef: React.MutableRefObject<string>;
  cardSubtitleRef: React.MutableRefObject<string>;
  cardClosingRef: React.MutableRefObject<string>;
  cardSecondsRef: React.MutableRefObject<"2" | "3" | "5">;
  cardBgRef: React.MutableRefObject<string>;
  cardTextRef: React.MutableRefObject<string>;
}

export function useTitleCards(): UseTitleCardsReturn {
  // Feature 2: Card notice (title/closing countdown)
  const [cardNotice, setCardNotice] = useState<{ kind: "title" | "closing"; secondsLeft: number } | null>(null);
  const cardNoticeTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Refs for mirroring state into function reads
  const cardPhaseRef = useRef<"title" | "closing" | null>(null);
  const cardTitleRef = useRef<string>("");
  const cardSubtitleRef = useRef<string>("");
  const cardClosingRef = useRef<string>("");
  const cardSecondsRef = useRef<"2" | "3" | "5">("3");
  const cardBgRef = useRef<string>("#0f172a");
  const cardTextRef = useRef<string>("#f8fafc");

  // Feature 3: Title & closing cards
  const [cardsOn, setCardsOn] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem("ta-rec-cards") === "1";
  });

  const [cardTitle, setCardTitle] = useState<string>(() => {
    if (typeof window === "undefined") return "";
    return localStorage.getItem("ta-rec-card-title") ?? "";
  });

  const [cardSubtitle, setCardSubtitle] = useState<string>(() => {
    if (typeof window === "undefined") return "";
    return localStorage.getItem("ta-rec-card-subtitle") ?? "";
  });

  const [cardClosing, setCardClosing] = useState<string>(() => {
    if (typeof window === "undefined") return "Thanks for watching.";
    return localStorage.getItem("ta-rec-card-closing") ?? "Thanks for watching.";
  });

  const [cardSeconds, setCardSeconds] = useState<"2" | "3" | "5">(() => {
    if (typeof window === "undefined") return "3";
    const saved = localStorage.getItem("ta-rec-card-secs");
    return saved === "2" || saved === "5" ? (saved as "2" | "5") : "3";
  });

  const [cardBg, setCardBg] = useState<string>(() => {
    if (typeof window === "undefined") return "#0f172a";
    return localStorage.getItem("ta-rec-card-bg") ?? "#0f172a";
  });

  const [cardText, setCardText] = useState<string>(() => {
    if (typeof window === "undefined") return "#f8fafc";
    return localStorage.getItem("ta-rec-card-text") ?? "#f8fafc";
  });

  // Persist card state to localStorage
  useEffect(() => {
    if (typeof window === "undefined") return;
    localStorage.setItem("ta-rec-cards", cardsOn ? "1" : "0");
    localStorage.setItem("ta-rec-card-title", cardTitle);
    localStorage.setItem("ta-rec-card-subtitle", cardSubtitle);
    localStorage.setItem("ta-rec-card-closing", cardClosing);
    localStorage.setItem("ta-rec-card-secs", cardSeconds);
    localStorage.setItem("ta-rec-card-bg", cardBg);
    localStorage.setItem("ta-rec-card-text", cardText);
  }, [cardsOn, cardTitle, cardSubtitle, cardClosing, cardSeconds, cardBg, cardText]);

  // Mirror Feature 3: card refs
  useEffect(() => {
    cardTitleRef.current = cardTitle;
    cardSubtitleRef.current = cardSubtitle;
    cardClosingRef.current = cardClosing;
    cardSecondsRef.current = cardSeconds;
    cardBgRef.current = cardBg;
    cardTextRef.current = cardText;
  }, [cardTitle, cardSubtitle, cardClosing, cardSeconds, cardBg, cardText]);

  return {
    cardsOn,
    setCardsOn,
    cardTitle,
    setCardTitle,
    cardSubtitle,
    setCardSubtitle,
    cardClosing,
    setCardClosing,
    cardSeconds,
    setCardSeconds,
    cardBg,
    setCardBg,
    cardText,
    setCardText,
    cardNotice,
    setCardNotice,
    cardNoticeTimerRef,
    cardPhaseRef,
    cardTitleRef,
    cardSubtitleRef,
    cardClosingRef,
    cardSecondsRef,
    cardBgRef,
    cardTextRef,
  };
}
