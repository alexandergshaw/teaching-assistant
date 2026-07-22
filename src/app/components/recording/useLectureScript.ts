"use client";

import { useEffect, useState } from "react";
import { generateLectureScriptAction } from "../../actions";
import { getStoredProvider } from "@/lib/llm-provider";

export interface UseLectureScriptReturn {
  scriptTopic: string;
  setScriptTopic: (value: string) => void;
  scriptObjectives: string;
  setScriptObjectives: (value: string) => void;
  scriptMinutes: "2" | "5" | "10" | "15";
  setScriptMinutes: (value: "2" | "5" | "10" | "15") => void;
  script: string;
  setScript: (value: string) => void;
  scriptBusy: boolean;
  setScriptBusy: (value: boolean) => void;
  scriptError: string | null;
  setScriptError: (value: string | null) => void;
  prompterOn: boolean;
  setPrompterOn: React.Dispatch<React.SetStateAction<boolean>>;
  prompterSize: "sm" | "md" | "lg";
  setPrompterSize: (value: "sm" | "md" | "lg") => void;
  handleGenerateScript: () => Promise<void>;
}

export function useLectureScript(): UseLectureScriptReturn {
  // Lecture script generation and teleprompter
  const [scriptTopic, setScriptTopic] = useState<string>(() => {
    if (typeof window === "undefined") return "";
    return localStorage.getItem("ta-rec-script-topic") ?? "";
  });

  const [scriptObjectives, setScriptObjectives] = useState<string>(() => {
    if (typeof window === "undefined") return "";
    return localStorage.getItem("ta-rec-script-objectives") ?? "";
  });

  const [scriptMinutes, setScriptMinutes] = useState<"2" | "5" | "10" | "15">(() => {
    if (typeof window === "undefined") return "5";
    const saved = localStorage.getItem("ta-rec-script-minutes");
    return saved === "2" || saved === "10" || saved === "15" ? saved : "5";
  });

  const [script, setScript] = useState<string>(() => {
    if (typeof window === "undefined") return "";
    return localStorage.getItem("ta-rec-script") ?? "";
  });

  const [scriptBusy, setScriptBusy] = useState(false);
  const [scriptError, setScriptError] = useState<string | null>(null);
  const [prompterOn, setPrompterOn] = useState(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem("ta-rec-prompter") === "1";
  });
  const [prompterSize, setPrompterSize] = useState<"sm" | "md" | "lg">(() => {
    if (typeof window === "undefined") return "md";
    const saved = localStorage.getItem("ta-rec-prompter-size");
    return (saved === "sm" || saved === "lg") ? saved : "md";
  });

  // Persist lecture script state to localStorage
  useEffect(() => {
    if (typeof window === "undefined") return;
    localStorage.setItem("ta-rec-script-topic", scriptTopic);
    localStorage.setItem("ta-rec-script-objectives", scriptObjectives);
    localStorage.setItem("ta-rec-script-minutes", scriptMinutes);
    localStorage.setItem("ta-rec-script", script);
  }, [scriptTopic, scriptObjectives, scriptMinutes, script]);

  const handleGenerateScript = async () => {
    setScriptBusy(true);
    setScriptError(null);
    const r = await generateLectureScriptAction(scriptTopic, scriptObjectives, Number(scriptMinutes), getStoredProvider());
    setScriptBusy(false);
    if ("error" in r) {
      setScriptError(r.error);
      return;
    }
    setScript(r.script);
  };

  return {
    scriptTopic,
    setScriptTopic,
    scriptObjectives,
    setScriptObjectives,
    scriptMinutes,
    setScriptMinutes,
    script,
    setScript,
    scriptBusy,
    setScriptBusy,
    scriptError,
    setScriptError,
    prompterOn,
    setPrompterOn,
    prompterSize,
    setPrompterSize,
    handleGenerateScript,
  };
}
