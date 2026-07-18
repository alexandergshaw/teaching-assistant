"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Button from "@mui/material/Button";
import TextField from "@mui/material/TextField";
import MenuItem from "@mui/material/MenuItem";
import {
  listAllOutlookMessagesAction,
  markOutlookMessageReadAction,
  draftMessageReplyAction,
  saveMessageDraftAction,
  getOutlookStatusAction,
} from "../actions";
import { useLlmProvider } from "@/lib/llm-provider";
import { useMailInbox } from "./MailInbox";
import { formatRelative } from "../utils/time";
import styles from "../page.module.css";

interface TabHeaderProps {
  eyebrow: string;
  title: string;
  subtitle: string;
}

function TabHeader({ eyebrow, title, subtitle }: TabHeaderProps) {
  return (
    <div className={styles.header}>
      <p className={styles.eyebrow}>{eyebrow}</p>
      <h1>{title}</h1>
      <p>{subtitle}</p>
    </div>
  );
}

interface Message {
  institution: string;
  id: string;
  fromName: string;
  fromAddress: string;
  subject: string;
  bodyPreview: string;
  receivedDateTime: string;
  isRead: boolean;
  webLink: string;
}

export default function MailTab() {
  const [provider] = useLlmProvider();
  const { refresh: refreshMailInbox } = useMailInbox();
  const [messages, setMessages] = useState<Message[]>([]);
  const [loadState, setLoadState] = useState<{ status: "loading" | "idle" | "error"; message: string }>({
    status: "loading",
    message: "",
  });
  const [search, setSearch] = useState(() => {
    if (typeof window === "undefined") return "";
    return localStorage.getItem("ta-mail-search") ?? "";
  });
  const [readFilter, setReadFilter] = useState<"all" | "unread" | "read">(() => {
    if (typeof window === "undefined") return "all";
    const saved = localStorage.getItem("ta-mail-read-filter");
    return saved === "unread" || saved === "read" ? saved : "all";
  });
  const [selectedInstitution, setSelectedInstitution] = useState<"all" | string>(() => {
    if (typeof window === "undefined") return "all";
    return localStorage.getItem("ta-mail-institution") ?? "all";
  });
  const [availableInstitutions, setAvailableInstitutions] = useState<string[]>([]);
  const [canMarkRead, setCanMarkRead] = useState<string[]>([]);
  const [expandedReply, setExpandedReply] = useState<string | null>(null);
  const [replyText, setReplyText] = useState("");
  const [draftingReply, setDraftingReply] = useState(false);
  const [savingDraft, setSavingDraft] = useState(false);
  const [replyNote, setReplyNote] = useState<{ kind: "success" | "error"; text: string } | null>(null);
  const [reconnectHintShown, setReconnectHintShown] = useState<Set<string>>(new Set());

  useEffect(() => {
    localStorage.setItem("ta-mail-search", search);
  }, [search]);

  useEffect(() => {
    localStorage.setItem("ta-mail-read-filter", readFilter);
  }, [readFilter]);

  useEffect(() => {
    localStorage.setItem("ta-mail-institution", selectedInstitution);
  }, [selectedInstitution]);

  const performLoad = useCallback(async () => {
    setLoadState({ status: "loading", message: "" });
    const [messagesResult, statusResult] = await Promise.all([
      listAllOutlookMessagesAction(),
      getOutlookStatusAction(),
    ]);

    if ("error" in messagesResult) {
      setMessages([]);
      setLoadState({ status: "error", message: messagesResult.error });
      return;
    }

    const merged: Message[] = [];
    const institutions = new Set<string>();
    let hasErrors = false;

    for (const account of messagesResult.accounts) {
      institutions.add(account.institution);
      if (account.error) {
        hasErrors = true;
      }
      for (const msg of account.messages) {
        merged.push({
          institution: account.institution,
          id: msg.id,
          fromName: msg.fromName,
          fromAddress: msg.fromAddress,
          subject: msg.subject,
          bodyPreview: msg.bodyPreview,
          receivedDateTime: msg.receivedDateTime,
          isRead: msg.isRead,
          webLink: msg.webLink,
        });
      }
    }

    merged.sort((a, b) => {
      const dateA = new Date(a.receivedDateTime).getTime();
      const dateB = new Date(b.receivedDateTime).getTime();
      return dateB - dateA;
    });

    setMessages(merged);
    setAvailableInstitutions(Array.from(institutions).sort());

    if (!("error" in statusResult)) {
      setCanMarkRead(statusResult.canMarkRead ?? []);
    }

    if (hasErrors) {
      setLoadState({
        status: "idle",
        message: "Loaded with some errors (see below). Some accounts may be missing messages.",
      });
    } else {
      setLoadState({ status: "idle", message: "" });
    }
  }, []);

  useEffect(() => {
    let active = true;
    (async () => {
      if (active) {
        await performLoad();
      }
    })();
    return () => {
      active = false;
    };
  }, [performLoad]);

  const filteredMessages = useMemo(() => {
    const term = search.trim().toLowerCase();
    return messages.filter((m) => {
      if (readFilter === "unread" && m.isRead) return false;
      if (readFilter === "read" && !m.isRead) return false;
      if (selectedInstitution !== "all" && m.institution !== selectedInstitution) return false;
      if (!term) return true;
      return (
        m.subject.toLowerCase().includes(term) ||
        m.fromName.toLowerCase().includes(term) ||
        m.fromAddress.toLowerCase().includes(term) ||
        m.bodyPreview.toLowerCase().includes(term)
      );
    });
  }, [messages, search, readFilter, selectedInstitution]);

  const handleMarkRead = async (msg: Message, isRead: boolean) => {
    const optimisticId = msg.id;
    setMessages((prev) =>
      prev.map((m) => (m.id === optimisticId ? { ...m, isRead } : m))
    );

    const result = await markOutlookMessageReadAction(msg.institution, msg.id, isRead);
    if ("error" in result) {
      setMessages((prev) =>
        prev.map((m) => (m.id === optimisticId ? { ...m, isRead: !isRead } : m))
      );
    } else {
      refreshMailInbox();
    }
  };

  const handleDraftReply = async (msg: Message) => {
    if (!msg.fromName || !msg.subject || !msg.bodyPreview) return;
    setDraftingReply(true);
    setReplyNote(null);

    const thread = `${msg.fromName} <${msg.fromAddress}>: ${msg.subject}\n${msg.bodyPreview}`;
    const result = await draftMessageReplyAction(thread, "", provider);
    setDraftingReply(false);
    if ("error" in result) {
      setReplyNote({ kind: "error", text: result.error });
      return;
    }
    setReplyText(result.body);
  };

  const handleSaveDraft = async (msg: Message) => {
    if (!replyText.trim() || !msg.fromName || !msg.subject) return;
    setSavingDraft(true);
    setReplyNote(null);

    const result = await saveMessageDraftAction("Reply to " + msg.fromName, {
      kind: "message",
      body: replyText.trim(),
      recipientEmail: msg.fromAddress,
      recipientName: msg.fromName,
      title: "Re: " + msg.subject,
      institution: msg.institution,
    });
    setSavingDraft(false);
    if ("error" in result) {
      setReplyNote({ kind: "error", text: result.error });
      return;
    }
    setReplyNote({ kind: "success", text: "Draft saved - review and send in Drafts > Messages." });
    setExpandedReply(null);
    setReplyText("");
  };

  if (messages.length === 0 && availableInstitutions.length === 0 && loadState.status === "idle") {
    return (
      <div className={styles.card}>
        <TabHeader
          eyebrow="Communications"
          title="Mail"
          subtitle="Every connected college inbox in one place. Replies are drafted here and sent from Drafts - nothing goes out without your approval."
        />
        <p className={styles.emptyState}>
          No connected Outlook accounts.{" "}
          <a href="/account/integrations" style={{ color: "var(--accent-ink)" }}>
            Connect Outlook under Account &gt; Integrations
          </a>
          .
        </p>
      </div>
    );
  }

  return (
    <div className={styles.card}>
      <TabHeader
        eyebrow="Communications"
        title="Mail"
        subtitle="Every connected college inbox in one place. Replies are drafted here and sent from Drafts - nothing goes out without your approval."
      />

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
        <div className={styles.resultsHeader} style={{ paddingTop: 0, flex: 1 }}>
          <Button
            variant="outlined"
            size="small"
            onClick={() => void performLoad()}
            disabled={loadState.status === "loading"}
          >
            {loadState.status === "loading" ? "Loading…" : "Refresh"}
          </Button>
        </div>
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <TextField
          type="search"
          size="small"
          style={{ flex: "1 1 160px", minWidth: 0 }}
          placeholder="Search subject, from, body"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <TextField
          select
          size="small"
          sx={{ minWidth: 110 }}
          value={readFilter}
          onChange={(e) => setReadFilter(e.target.value as "all" | "unread" | "read")}
          aria-label="Filter by read state"
        >
          <MenuItem value="all">All</MenuItem>
          <MenuItem value="unread">Unread</MenuItem>
          <MenuItem value="read">Read</MenuItem>
        </TextField>
        {availableInstitutions.length > 1 && (
          <TextField
            select
            size="small"
            sx={{ minWidth: 110 }}
            value={selectedInstitution}
            onChange={(e) => setSelectedInstitution(e.target.value)}
            aria-label="Filter by institution"
          >
            <MenuItem value="all">All institutions</MenuItem>
            {availableInstitutions.map((inst) => (
              <MenuItem key={inst} value={inst}>
                {inst}
              </MenuItem>
            ))}
          </TextField>
        )}
      </div>

      {loadState.status === "error" && <p className={styles.error}>{loadState.message}</p>}
      {loadState.status === "loading" && (
        <div className={styles.loadingState} role="status" aria-live="polite">
          <span className={styles.spinner} aria-hidden="true" />
          <div>
            <p className={styles.loadingTitle}>Loading mailbox…</p>
          </div>
        </div>
      )}

      {loadState.status === "idle" && filteredMessages.length === 0 && (
        <p className={styles.emptyState}>No messages match.</p>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {filteredMessages.map((msg) => {
          const unread = !msg.isRead;
          const isExpanded = expandedReply === msg.id;
          const canMarkReadForInst = canMarkRead.includes(msg.institution);
          const hasShownHint = reconnectHintShown.has(msg.institution);

          return (
            <div key={msg.id} className={styles.syllabusSectionCard}>
              <div className={styles.syllabusSectionTopRow}>
                <div style={{ display: "flex", alignItems: "flex-start", gap: 8, flex: 1, minWidth: 0 }}>
                  <span style={{ fontSize: "0.72rem", fontWeight: 700, padding: "2px 8px", borderRadius: "6px", background: "color-mix(in srgb, var(--accent) 12%, transparent)", color: "var(--accent-ink)", whiteSpace: "nowrap" }}>
                    {msg.institution}
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "flex-start", gap: 8, flexWrap: "wrap", marginBottom: 2 }}>
                      <span style={{ fontWeight: unread ? 700 : 600, fontSize: "0.95rem" }}>
                        {msg.fromName}
                      </span>
                      <span style={{ fontSize: "0.85rem", color: "var(--text-secondary)", whiteSpace: "nowrap" }}>
                        {formatRelative(msg.receivedDateTime)}
                      </span>
                    </div>
                    <h3 style={{ margin: 0, fontSize: "0.95rem", fontWeight: unread ? 700 : 600, color: "var(--text-primary)" }}>
                      {msg.subject}
                    </h3>
                    {msg.bodyPreview && (
                      <p style={{ margin: "4px 0 0", fontSize: "0.85rem", color: "var(--text-secondary)", lineHeight: 1.5 }}>
                        {msg.bodyPreview}
                      </p>
                    )}
                  </div>
                </div>
              </div>

              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
                {msg.webLink && (
                  <Button
                    size="small"
                    variant="text"
                    onClick={() => window.open(msg.webLink, "_blank")}
                  >
                    Open in Outlook
                  </Button>
                )}
                <Button
                  size="small"
                  variant="text"
                  onClick={() => void handleMarkRead(msg, unread)}
                  disabled={!canMarkReadForInst}
                  title={!canMarkReadForInst ? `Reconnect Outlook for ${msg.institution} to enable this` : ""}
                >
                  {unread ? "Mark read" : "Mark unread"}
                </Button>
                {!canMarkReadForInst && !hasShownHint && (
                  <div style={{ fontSize: "0.8rem", color: "var(--text-secondary)", width: "100%" }}>
                    Outlook is connected but mailbox updates are not granted - reconnect Outlook for {msg.institution} to grant Mail.ReadWrite.
                  </div>
                )}
                {!canMarkReadForInst && !hasShownHint && (() => {
                  setReconnectHintShown((prev) => new Set([...prev, msg.institution]));
                  return null;
                })()}
                <Button
                  size="small"
                  variant="text"
                  onClick={() => {
                    if (isExpanded) {
                      setExpandedReply(null);
                      setReplyText("");
                      setReplyNote(null);
                    } else {
                      setExpandedReply(msg.id);
                      setReplyText("");
                      setReplyNote(null);
                    }
                  }}
                >
                  {isExpanded ? "Cancel reply" : "Draft reply"}
                </Button>
              </div>

              {isExpanded && (
                <div className={styles.inboxReplyBox} style={{ marginTop: 10 }}>
                  <div className={styles.field}>
                    <label htmlFor={`mail-reply-${msg.id}`} style={{ margin: 0 }}>
                      Your reply
                    </label>
                    <TextField
                      id={`mail-reply-${msg.id}`}
                      multiline
                      minRows={4}
                      fullWidth
                      placeholder="Write your reply, or use Draft with AI below."
                      value={replyText}
                      onChange={(e) => setReplyText(e.target.value)}
                    />
                  </div>

                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <Button
                      size="small"
                      variant="outlined"
                      onClick={() => void handleDraftReply(msg)}
                      disabled={draftingReply}
                    >
                      {draftingReply ? "Drafting…" : "Draft with AI"}
                    </Button>
                    <Button
                      size="small"
                      variant="contained"
                      onClick={() => void handleSaveDraft(msg)}
                      disabled={savingDraft || !replyText.trim()}
                    >
                      {savingDraft ? "Saving…" : "Save draft"}
                    </Button>
                  </div>

                  {replyNote && (
                    <p style={{ fontSize: "0.85rem", color: replyNote.kind === "error" ? "var(--danger)" : "var(--text-secondary)", margin: "8px 0 0" }}>
                      {replyNote.text}
                    </p>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
