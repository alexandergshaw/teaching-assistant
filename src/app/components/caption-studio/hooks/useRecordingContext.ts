import { useState, useEffect } from "react";
import { gatherRecordingContext } from "../utils/captions";

export function useRecordingContext() {
  const [context, setContext] = useState<string>(() => {
    if (typeof window === "undefined") return "";
    return localStorage.getItem("ta-cap-context") ?? "";
  });
  const [usePageContext, setUsePageContext] = useState<boolean>(() => {
    if (typeof window === "undefined") return true;
    return localStorage.getItem("ta-cap-use-page") !== "0";
  });
  const [pageContextSummary] = useState(() => gatherRecordingContext().summary);

  useEffect(() => {
    if (typeof window === "undefined") return;
    localStorage.setItem("ta-cap-context", context);
  }, [context]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    localStorage.setItem("ta-cap-use-page", usePageContext ? "1" : "0");
  }, [usePageContext]);

  return {
    context,
    setContext,
    usePageContext,
    setUsePageContext,
    pageContextSummary,
  };
}
