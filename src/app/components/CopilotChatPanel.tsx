"use client";

import { useEffect, useRef, useState } from "react";
import { listGithubModelsAction, copilotChatAction } from "../actions";
import type { GithubModel, ModelUsage, ChatMessage } from "@/lib/github-models";
import Button from "@mui/material/Button";
import TextField from "@mui/material/TextField";
import MenuItem from "@mui/material/MenuItem";
import CircularProgress from "@mui/material/CircularProgress";
import styles from "../page.module.css";

interface CopilotChatPanelProps {
  filePath: string;
  fileContent: string;
}

export default function CopilotChatPanel({ filePath, fileContent }: CopilotChatPanelProps) {
  const [models, setModels] = useState<GithubModel[]>([]);
  const [modelsState, setModelsState] = useState<"loading" | "idle" | "error">("loading");
  const [model, setModel] = useState("");
  const [messages, setMessages] = useState<Array<{ role: "user" | "assistant"; content: string }>>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [usage, setUsage] = useState<ModelUsage | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const r = await listGithubModelsAction();
      if (cancelled) return;
      if ("error" in r) {
        setModelsState("error");
        setError(r.error);
        return;
      }
      setModels(r.models);
      setModelsState("idle");
      if (r.models.length > 0) {
        const preferred = r.models.find((m) => /mini/i.test(m.id)) ?? r.models[0];
        setModel(preferred.id);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, busy]);

  const send = async () => {
    const text = input.trim();
    if (!text || !model || busy) return;
    const nextMessages = [...messages, { role: "user" as const, content: text }];
    setMessages(nextMessages);
    setInput("");
    setBusy(true);
    setError(null);
    const system: ChatMessage = {
      role: "system",
      content: `You are a coding assistant helping with the file "${filePath}". Here is its current content:\n\n\`\`\`\n${fileContent}\n\`\`\``,
    };
    const payload: ChatMessage[] = [system, ...nextMessages.map((m) => ({ role: m.role, content: m.content }))];
    const r = await copilotChatAction(model, payload);
    setBusy(false);
    if ("error" in r) {
      setError(r.error);
      return;
    }
    setMessages((prev) => [...prev, { role: "assistant", content: r.content }]);
    setUsage(r.usage);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "60vh", border: "1px solid var(--field-border)", borderRadius: 8, overflow: "hidden" }}>
      <div style={{ padding: 8, borderBottom: "1px solid var(--field-border)", display: "flex", gap: 8, alignItems: "center" }}>
        <span style={{ fontSize: "0.85rem", fontWeight: 500 }}>Copilot chat</span>
        <TextField
          select
          size="small"
          value={model}
          onChange={(e) => setModel(e.target.value)}
          disabled={modelsState !== "idle"}
          sx={{ marginLeft: "auto", minWidth: 160 }}
        >
          {modelsState === "loading" && <MenuItem value="">Loading models...</MenuItem>}
          {modelsState === "error" && <MenuItem value="">Models unavailable</MenuItem>}
          {models.map((m) => (
            <MenuItem key={m.id} value={m.id}>{m.name || m.id}</MenuItem>
          ))}
        </TextField>
      </div>
      <div ref={scrollRef} style={{ flex: 1, overflowY: "auto", padding: 10, display: "flex", flexDirection: "column", gap: 10 }}>
        {messages.length === 0 && <p className={styles.fieldHint}>Ask about {filePath}. The file contents are sent as context.</p>}
        {messages.map((m, i) => (
          <div key={i} style={{ alignSelf: m.role === "user" ? "flex-end" : "flex-start", maxWidth: "90%" }}>
            <div style={{ fontSize: "0.7rem", color: "var(--text-secondary)", marginBottom: 2 }}>{m.role === "user" ? "You" : "Copilot"}</div>
            <div style={{ whiteSpace: "pre-wrap", fontSize: "0.85rem", background: m.role === "user" ? "color-mix(in srgb, var(--accent) 12%, transparent)" : "color-mix(in srgb, var(--field-border) 30%, transparent)", border: "1px solid var(--field-border)", borderRadius: 8, padding: "6px 10px" }}>{m.content}</div>
          </div>
        ))}
        {busy && (
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <CircularProgress size={16} />
            <span className={styles.fieldHint}>Thinking...</span>
          </div>
        )}
        {error && <p className={styles.error}>{error}</p>}
      </div>
      {usage && (
        <div style={{ padding: "4px 10px", borderTop: "1px solid var(--field-border)", fontSize: "0.72rem", color: "var(--text-secondary)" }}>
          {usage.totalTokens != null ? `${usage.totalTokens} tokens` : ""}
          {usage.rateLimitRemaining != null ? ` - ${usage.rateLimitRemaining}${usage.rateLimitLimit ? `/${usage.rateLimitLimit}` : ""} requests left` : ""}
        </div>
      )}
      <div style={{ padding: 8, borderTop: "1px solid var(--field-border)", display: "flex", gap: 8 }}>
        <TextField
          size="small"
          fullWidth
          multiline
          maxRows={4}
          placeholder="Ask Copilot about this file..."
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void send();
            }
          }}
          disabled={busy || !model}
        />
        <Button variant="contained" size="small" onClick={send} disabled={busy || !model || !input.trim()}>Send</Button>
      </div>
    </div>
  );
}
