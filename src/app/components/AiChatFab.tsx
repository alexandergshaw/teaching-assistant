"use client";
import { useState, useRef, useCallback, useEffect, useSyncExternalStore } from "react";
import AiChatWindow from "./AiChatWindow";
import LiveClassWindow, { LIVE_CLASS_WINDOW_W, LIVE_CLASS_WINDOW_H } from "./live-class/LiveClassWindow";
import WeeklyChecklistOverviewModal from "./courses/WeeklyChecklistOverviewModal";
import { LegibilityProbeModal } from "./grading-recording/LegibilityProbeModal";
import { useLiveClassSession } from "./live-class/useLiveClassSession";
import {
  isLiveClassSessionActive,
  formatElapsedCompact,
  computeDefaultWindowPos,
  computeLiveBadgePosition,
  computeUnreadBadgePosition,
} from "./live-class/fab-live-indicator";
import FabQuickActionsMenu from "./FabQuickActionsMenu";
import { ChatIcon } from "./fab-icons";
import { clampPosToViewport, supportsGetDisplayMedia, supportsMicrophone } from "./fab-menu-logic";
import { usePromptSuggestions } from "@/hooks/usePromptSuggestions";
import { useWindowHeaderDrag } from "@/hooks/useWindowHeaderDrag";
import type {
  ChatAttachment,
  ChatKnowledgeContext,
  ChatKnowledgeContextSummary,
  ChatMessage,
  ChatSelectionContext,
  ChatToneStatus,
} from "@/lib/chat/types";
import { CHAT_ATTACHMENT_BUDGET_BYTES, trimAttachmentsToBudget } from "@/lib/chat/attachments";
import { OPEN_AI_CHAT_EVENT, parseOpenChatDetail } from "@/lib/chat/open-chat";
import { navigateToRecordingTool } from "@/lib/recording-launch";
import { getStoredProvider } from "@/lib/llm-provider";
import { readActiveInstitution } from "@/lib/institutions";
import { getChatToneStatusAction } from "../actions";
import styles from "../page.module.css";

interface Pos { x: number; y: number }

const CHAT_W = 360;
const CHAT_H = 420;
const DIAL_BOTTOM = 24;
const DIAL_RIGHT = 24;
// MUI's default SpeedDial Fab diameter - needed to place the live-recording
// badge beside it rather than guessing a pixel offset (see
// computeLiveBadgePosition's comment for why "beside", not "above").
const FAB_SIZE = 56;
const LIVE_BADGE_HEIGHT = 32;
const LIVE_BADGE_GAP = 12;
// D5/D8's unread-answer badge on the FAB itself - a small circle for a
// single-digit count, growing into a pill for "9+" via the CSS's padding +
// 999px border-radius (see .fabUnreadBadge in page.module.css).
const UNREAD_BADGE_SIZE = 20;

// ── localStorage helpers ──────────────────────────────────────────────────────

const LS_PREFIX = "ta:";

function readLS<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = localStorage.getItem(LS_PREFIX + key);
    return raw !== null ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeLS<T>(key: string, value: T): void {
  try {
    localStorage.setItem(LS_PREFIX + key, JSON.stringify(value));
  } catch {
    // Quota exceeded or private-browsing restriction — silently ignore.
  }
}

// ─────────────────────────────────────────────────────────────────────────────

function subscribe() { return () => {}; }

export default function AiChatFab() {
  const mounted = useSyncExternalStore(subscribe, () => true, () => false);

  // Restore open/closed state from localStorage.
  const [chatOpen, setChatOpen] = useState<boolean>(() => readLS("chat-open", false));
  const [liveClassOpen, setLiveClassOpen] = useState<boolean>(() => readLS("live-class-open", false));
  // Weekly Checklist Overview: now a THIRD floating window, same as
  // chatOpen/liveClassOpen above (see that component's own file for why it
  // moved off the previewBackdrop/previewModal pattern it used to use) - its
  // open/closed state persists the same way theirs does. Staleness from a
  // long-lived mount is handled inside the window itself (a fetch on every
  // mount, i.e. every open, plus a manual Refresh control), not by refusing
  // to persist the boolean.
  const [checklistOverviewOpen, setChecklistOverviewOpen] = useState<boolean>(() => readLS("checklist-overview-open", false));

  // Legibility probe (R1/R1a/R1b): a FOURTH modal-shaped dial entry, same
  // open/closed persistence idiom as checklistOverviewOpen immediately above
  // - the fab is the only surface this diagnostic can reach from (it is
  // mounted in layout.tsx, outside page.tsx, same reason the three original
  // dial actions open floating windows/modals instead of navigating - see
  // this file's own reasoning on navigateToRecordingTool further down for
  // the contrasting case). Unlike the capture/transcript it displays - which
  // LegibilityProbeModal itself discards on close (see that file's header) -
  // there is nothing sensitive in "was this diagnostic left open", so it
  // persists the same boolean way every other dial-opened surface here does.
  const [legibilityProbeOpen, setLegibilityProbeOpen] = useState<boolean>(() => readLS("legibility-probe-open", false));

  // HOISTED above the window body (H3): this is the one and only instance of
  // the live-class session controller for the whole app, owned by this
  // always-mounted FAB rather than by the floating window. Toggling
  // liveClassOpen only mounts/unmounts <LiveClassWindow>'s display - it never
  // touches this hook, so closing the window does not stop the class, does
  // not re-run session setup, and does not re-request the microphone. Because
  // AiChatFab itself is only ever mounted once (see src/app/layout.tsx), only
  // one live session can ever exist.
  const liveClass = useLiveClassSession({ windowOpen: liveClassOpen });

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Names of attachments from the most recent exchange that produced nothing
  // (see filesToLlmPartsDetailed) - reset on every new send so it only ever
  // describes the exchange that just happened.
  const [skippedFiles, setSkippedFiles] = useState<string[]>([]);

  // Knowledge-tab context (A1/A2/A7), set when "open-ai-chat" is dispatched
  // with a non-empty knowledgePageIds detail (see the "open-ai-chat"
  // listener below and src/lib/chat/open-chat.ts's parser). Persists for the
  // lifetime of THIS open chat window/session, not just the next message -
  // see handleSend's use of it and handleChatClose's reset, and the longer
  // rationale comment on handleSend below for why session-scoped is the
  // right lifetime rather than "consumed after one message".
  const [knowledgeContext, setKnowledgeContext] = useState<ChatKnowledgeContext | null>(null);

  // Server-confirmed counts for the current knowledgeContext (A7), populated
  // from /api/ai-chat's `knowledgeContext` response field after the FIRST
  // send that carried context - see handleSend. Until then (context just
  // loaded, nothing sent yet) the display below falls back to the client's
  // own requested-selection count; this is strictly more trustworthy once
  // available because it reflects A3's ownership re-check and A5's budget,
  // so it can be lower than what was requested. Reset alongside
  // knowledgeContext itself (context cleared/session closed) and whenever a
  // send carries NO context, so a stale count from an earlier selection can
  // never linger and describe the wrong thing.
  const [knowledgeContextInfo, setKnowledgeContextInfo] = useState<ChatKnowledgeContextSummary | null>(null);

  // Modules bulk-select context (C2), set when "open-ai-chat" is dispatched
  // with a usable `selectionContext` detail (see the "open-ai-chat"
  // listener below and parseOpenChatDetail's own C1 validation, which
  // already guarantees `text` is non-empty whenever this is present).
  // Mirrors knowledgeContext immediately above in every respect that
  // matters here - same session lifetime (reset in handleChatClose), same
  // "sent with every message" rule in handleSend - but is otherwise fully
  // INDEPENDENT of it (C3): a dispatch can set one, the other, both, or
  // neither, and setting one never clears the other. Unlike knowledgeContext,
  // there is no server-confirmed-counts companion state for this (no
  // "selectionContextInfo") - the text was already gathered and finalized
  // client-side at click time (D1), so there is nothing analogous to A7's
  // post-ownership-check recount for the FAB to wait for or prefer.
  const [selectionContext, setSelectionContext] = useState<ChatSelectionContext | null>(null);

  // Whether the FAB chat is mimicking the instructor's writing tone right
  // now, for the status chip in AiChatWindow. Left null (no chip) until the
  // window has actually been opened at least once - the FAB itself is
  // always mounted, so fetching this on mount/every render would cost a
  // request on every page load for no reason.
  const [toneStatus, setToneStatus] = useState<ChatToneStatus | null>(null);

  // Fetch the tone status only when the chat window opens. The embedded
  // provider never calls a model (see the route), so no tone is ever
  // applied there - that is decided client-side from the stored provider
  // without a network round trip, and only otherwise do we ask the server
  // action (which mirrors the exact same getWritingStyleBlock check the
  // route uses, so the chip can never claim more than the route actually did).
  useEffect(() => {
    if (!chatOpen) return;
    let cancelled = false;
    (async () => {
      // Setting state must happen after an await, never synchronously in the
      // effect body (see the setState-in-effect idiom) - this microtask hop
      // covers the embedded branch below too, which has no other await.
      await Promise.resolve();
      if (getStoredProvider() === "embedded") {
        if (!cancelled) setToneStatus("embedded");
        return;
      }
      try {
        const result = await getChatToneStatusAction();
        if (!cancelled) setToneStatus(result.active ? "active" : "no-sample");
      } catch {
        if (!cancelled) setToneStatus("no-sample");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [chatOpen]);

  const { suggestions, recordPrompt } = usePromptSuggestions();

  // Stable session ID for the lifetime of this chat window; regenerated on close.
  const sessionIdRef = useRef<string>(crypto.randomUUID());

  // Restore positions from localStorage.  If chatOpen was persisted as true
  // and no explicit position is saved we compute the default here — this is safe because the
  // component returns null during SSR (via the `mounted` guard below), so there is no
  // hydration mismatch.
  const [chatPos, setChatPosState] = useState<Pos>(() => {
    const saved = readLS<Pos | null>("chat-pos", null);
    if (saved) {
      // F2: a position saved on a wider monitor must not reopen off-viewport
      // on a narrower one - see fab-menu-logic.ts's clampPosToViewport.
      return typeof window !== "undefined"
        ? clampPosToViewport(saved, { width: CHAT_W, height: CHAT_H }, { width: window.innerWidth, height: window.innerHeight })
        : saved;
    }
    if (typeof window !== "undefined" && readLS<boolean>("chat-open", false)) {
      return {
        x: Math.max(8, window.innerWidth - CHAT_W - DIAL_RIGHT - 8),
        y: Math.max(8, window.innerHeight - CHAT_H - 100),
      };
    }
    return { x: 0, y: 0 };
  });
  const chatPosRef = useRef<Pos>(chatPos);
  const setChatPos = useCallback((pos: Pos) => {
    chatPosRef.current = pos;
    setChatPosState(pos);
  }, []);

  const [liveClassPos, setLiveClassPosState] = useState<Pos>(() => {
    const saved = readLS<Pos | null>("live-class-pos", null);
    if (saved) {
      // F2: same clamp as chatPos above - restoring blindly is exactly the
      // bug this pass fixes.
      return typeof window !== "undefined"
        ? clampPosToViewport(
            saved,
            { width: LIVE_CLASS_WINDOW_W, height: LIVE_CLASS_WINDOW_H },
            { width: window.innerWidth, height: window.innerHeight }
          )
        : saved;
    }
    if (typeof window !== "undefined" && readLS<boolean>("live-class-open", false)) {
      return computeDefaultWindowPos(
        { width: window.innerWidth, height: window.innerHeight },
        { width: LIVE_CLASS_WINDOW_W, height: LIVE_CLASS_WINDOW_H },
        { right: DIAL_RIGHT, bottom: 100 }
      );
    }
    return { x: 0, y: 0 };
  });
  const liveClassPosRef = useRef<Pos>(liveClassPos);
  const setLiveClassPos = useCallback((pos: Pos) => {
    liveClassPosRef.current = pos;
    setLiveClassPosState(pos);
  }, []);

  // Persist open/closed state to localStorage whenever it changes.
  useEffect(() => { writeLS("chat-open", chatOpen); }, [chatOpen]);
  useEffect(() => { writeLS("live-class-open", liveClassOpen); }, [liveClassOpen]);
  useEffect(() => { writeLS("checklist-overview-open", checklistOverviewOpen); }, [checklistOverviewOpen]);
  useEffect(() => { writeLS("legibility-probe-open", legibilityProbeOpen); }, [legibilityProbeOpen]);

  // Persist position to localStorage whenever it changes.
  useEffect(() => { writeLS("chat-pos", chatPos); }, [chatPos]);
  useEffect(() => { writeLS("live-class-pos", liveClassPos); }, [liveClassPos]);

  // Shared by both places that can open the chat window without an
  // explicit prior position (the "open-ai-chat" listener below and the
  // menu's handleOpenChat further down) - a bottom-right default, computed
  // once and only when nothing has ever been saved.
  const ensureChatDefaultPos = useCallback(() => {
    if (!readLS<Pos | null>("chat-pos", null)) {
      setChatPos({
        x: Math.max(8, window.innerWidth - CHAT_W - DIAL_RIGHT - 8),
        y: Math.max(8, window.innerHeight - CHAT_H - 100),
      });
    }
  }, [setChatPos]);

  // Listen for the "open-ai-chat" event. Three dispatchers today, all going
  // through src/lib/chat/open-chat.ts: the context menu (ContextMenu.tsx, no
  // detail at all), the Knowledge tab's "Ask AI" bulk action (a detail
  // carrying selected page ids), and the Modules view's "Ask AI" bulk-bar row
  // (a detail carrying an already-gathered selection context block).
  // Calling setState in a subscribed event callback (not directly in the effect body) is fine.
  //
  // parseOpenChatDetail is defensive and never throws (A2), so a malformed
  // or absent `detail` - including the context menu's zero-argument dispatch
  // - degrades to `null` and simply opens the chat with whatever context (if
  // any) was already loaded, rather than blowing up this listener. Only a
  // detail that actually resolves to a NON-EMPTY page-id list replaces the
  // current knowledgeContext - a generic "bring the chat forward" dispatch
  // with no detail must never silently clear context the user just loaded.
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = e instanceof CustomEvent ? parseOpenChatDetail(e.detail) : null;
      if (detail?.knowledgePageIds && detail.knowledgePageIds.length > 0) {
        setKnowledgeContext({ knowledgePageIds: detail.knowledgePageIds, label: detail.label });
        // A fresh selection replacing a prior one (chat already open) must
        // drop the old selection's server-confirmed counts too - otherwise
        // the A7 strip would keep describing the PREVIOUS "Ask AI" click
        // until the next message is sent.
        setKnowledgeContextInfo(null);
      }
      // C3: a selectionContext carried by this SAME dispatch is entirely
      // independent of knowledgePageIds above - a single "Ask AI" click from
      // the Modules bulk bar sets ONLY this, a Knowledge-tab click sets ONLY
      // knowledgeContext, and (per C3) neither branch ever clears the
      // other's state. parseOpenChatDetail (C1) already guarantees `text` is
      // a non-empty string whenever `selectionContext` is present at all, so
      // no further validation is needed here - same trust the
      // knowledgePageIds branch above already places in the parser.
      if (detail?.selectionContext) {
        setSelectionContext({ text: detail.selectionContext.text, label: detail.selectionContext.label });
      }
      setChatOpen(true);
      ensureChatDefaultPos();
    };
    window.addEventListener(OPEN_AI_CHAT_EVENT, handler);
    return () => window.removeEventListener(OPEN_AI_CHAT_EVENT, handler);
  }, [ensureChatDefaultPos]);

  // Chat/Live Class window headers: drag to reposition. Both windows used to
  // keep their own byte-for-byte copy of this mousedown/mousemove/mouseup
  // dance; now shared via useWindowHeaderDrag once a THIRD window (Weekly
  // Checklist Overview) needed the identical algorithm.
  const onChatHeaderMouseDown = useWindowHeaderDrag(chatPosRef, setChatPos);
  const onLiveClassHeaderMouseDown = useWindowHeaderDrag(liveClassPosRef, setLiveClassPos);

  // F2: every quick-actions menu entry OPENS its destination - it never
  // toggles closed one that is already open (closing is that window's own
  // header "x" control's job). Clicking "AI Chatbot" while the chat is
  // already open is therefore a harmless no-op, exactly matching the
  // "open-ai-chat" event listener above, which has always done this
  // unconditionally - the toggle-vs-open inconsistency between that event
  // path and the menu's own actions is the bug this fixes.
  const handleOpenChat = useCallback(() => {
    setChatOpen(true);
    ensureChatDefaultPos();
  }, [ensureChatDefaultPos]);

  const handleOpenLiveClass = useCallback(() => {
    setLiveClassOpen(true);
    if (!readLS<Pos | null>("live-class-pos", null)) {
      setLiveClassPos(
        computeDefaultWindowPos(
          { width: window.innerWidth, height: window.innerHeight },
          { width: LIVE_CLASS_WINDOW_W, height: LIVE_CLASS_WINDOW_H },
          { right: DIAL_RIGHT, bottom: 100 }
        )
      );
    }
  }, [setLiveClassPos]);

  const handleOpenChecklist = useCallback(() => {
    setChecklistOverviewOpen(true);
  }, []);

  const handleOpenLegibilityProbe = useCallback(() => {
    setLegibilityProbeOpen(true);
  }, []);

  // F4: the three former recording-variant entries (Discussions,
  // Announcement, Grading) are merged into this one call, landing on the
  // Recording tab's base "record" view rather than opening a nested
  // submenu. A nested MUI submenu would need its own hand-rolled keyboard
  // handling (MUI's core Menu has no built-in submenu support) to get right
  // the same roving-tabIndex/Escape/focus-restore behavior the top-level
  // Menu gets for free - not a good trade against a destination that
  // already exposes all eight views in its own labelled, accessible tab
  // strip once you land there. Deliberately navigateToRecordingTool (not
  // openRecordingTool) - see the two-line comment further below where this
  // used to be inlined three times, one per removed entry, for why.
  const handleOpenRecordingTools = useCallback(() => {
    navigateToRecordingTool("record");
  }, []);

  const handleSend = useCallback(async (text: string, attachments: ChatAttachment[]) => {
    const provider = getStoredProvider();
    // The embedded provider is text-only and cannot read files (see AC6 in
    // the route) - the attach control is disabled for it below, so this is
    // only a safety net against a stale attachment from before a provider
    // switch.
    const effectiveAttachments = provider === "embedded" ? [] : attachments;

    const nextMessages: ChatMessage[] = [
      ...messages,
      { role: "user", text, ...(effectiveAttachments.length > 0 ? { attachments: effectiveAttachments } : {}) },
    ];

    // Bound the total attachment payload before it ever reaches fetch — a
    // request over Vercel's ~4.5MB serverless body limit fails opaquely, so
    // this either trims older attachments (their content is already
    // summarized by the assistant's reply that followed them) or, if the
    // newest message alone is too big, refuses the send with a real reason.
    const budgeted = trimAttachmentsToBudget(nextMessages, CHAT_ATTACHMENT_BUDGET_BYTES);
    if (budgeted.rejected) {
      setError(budgeted.rejected);
      return;
    }

    setMessages(nextMessages);
    setLoading(true);
    setError(null);
    setSkippedFiles([]);
    recordPrompt(text);

    try {
      // The server derives its own candidate institution set from this
      // user's data and validates this hint against it before trusting it
      // for anything (see route.ts's buildEntityGroundingBlockForTurn) - it
      // is only ever a convenience for the deictic fallback ("what's the
      // policy at THIS institution"), never an access key, so reading it
      // straight from localStorage here (rather than the reactive
      // useInstitutionSelection hook, which would re-render this component
      // on every institution change for no benefit) is safe.
      const activeInstitution = readActiveInstitution() || null;

      // contextPageIds (A1/A3): re-sent with EVERY message for the lifetime
      // of this open chat window/session, not just the message that was on
      // screen when "Ask AI" was clicked. Field name matches RequestBody in
      // src/app/api/ai-chat/route.ts exactly (confirmed by reading that
      // file - see this task's report for the reconciliation, since the
      // AC document did not fix a name and the route landed concurrently
      // with this one). Two reasons this is session-scoped rather than
      // consumed-once: (1) the server is stateless per D1/A3 - it
      // re-derives the context block from these ids on every request rather
      // than remembering a prior turn's context, so a follow-up question
      // ("what about the late-work policy?") would silently lose its
      // grounding after turn one if this were sent only once; (2) this file
      // already scopes the analogous "session" concepts - `messages` and
      // `sessionIdRef` - to "until handleChatClose runs" (see that handler,
      // which resets both), so giving the loaded knowledge context the same
      // lifetime keeps a single mental model: closing the window is what
      // starts a genuinely new conversation, not sending one more message.
      const response = await fetch("/api/ai-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: budgeted.messages,
          sessionId: sessionIdRef.current,
          provider,
          activeInstitution,
          ...(knowledgeContext ? { contextPageIds: knowledgeContext.knowledgePageIds } : {}),
          // selectionContextText (C2): re-sent with EVERY message for the
          // lifetime of this open chat window, same session-scoped
          // reasoning as contextPageIds above - except this text was
          // already fully gathered and finalized client-side at click time
          // (D1), so there is nothing for the server to re-derive; it only
          // re-validates and injects the string as-is (see route.ts's C5/C6).
          ...(selectionContext ? { selectionContextText: selectionContext.text } : {}),
        }),
      });
      const data = (await response.json()) as {
        reply?: string;
        error?: string;
        skipped?: string[];
        knowledgeContext?: ChatKnowledgeContextSummary & { skippedAttachments: string[] } | null;
      };

      if (!response.ok || data.error) {
        setError(data.error ?? "Something went wrong.");
      } else {
        setMessages(msgs => [...msgs, { role: "assistant", text: data.reply ?? "" }]);
        // A5: skipped attachments - both the ordinary per-message ones
        // (data.skipped, unchanged from before this feature) and, now, any
        // Knowledge-tab attachments the server could not read
        // (data.knowledgeContext.skippedAttachments) - land in this SAME
        // skippedFiles channel rather than a parallel one, per this file's
        // existing convention (see the state's own doc comment).
        setSkippedFiles([...(data.skipped ?? []), ...(data.knowledgeContext?.skippedAttachments ?? [])]);
        // A7: prefer the server-confirmed counts (post ownership-check,
        // post-budget - see ChatKnowledgeContextSummary's doc) once a
        // response carrying them arrives; cleared when this turn sent no
        // context at all so a stale count from an earlier selection never
        // lingers.
        setKnowledgeContextInfo(data.knowledgeContext ?? null);
      }
    } catch {
      setError("Failed to reach the server.");
    } finally {
      setLoading(false);
    }
  }, [messages, recordPrompt, knowledgeContext, selectionContext]);

  const handleChatClose = useCallback(() => {
    setChatOpen(false);
    setMessages([]);
    setError(null);
    setSkippedFiles([]);
    // Knowledge context is scoped to this session too (see handleSend's
    // comment) - closing the window is what ends the conversation the
    // context was loaded for, so the next "Ask AI"/open must supply it
    // again rather than a stale selection silently carrying over.
    setKnowledgeContext(null);
    setKnowledgeContextInfo(null);
    // Modules-selection context is scoped to this session too, same reason
    // as knowledgeContext just above (C2) - closing the window is what ends
    // the conversation the selection was gathered for, so a re-opened chat
    // never silently carries a stale Modules selection forward.
    setSelectionContext(null);
    // Fresh session ID for next time the window opens.
    sessionIdRef.current = crypto.randomUUID();
  }, []);

  if (!mounted) return null;

  // F6: two menu actions can only fail AFTER the click today - the
  // legibility probe needs getDisplayMedia, Live Class needs a microphone.
  // Feature-detected once per render (mounted above already guarantees
  // we're past SSR) and passed down so FabQuickActionsMenu can disable-with-
  // reason BEFORE the click, rather than only after.
  const liveClassDisabledReason = supportsMicrophone(typeof navigator !== "undefined" ? navigator : undefined)
    ? undefined
    : "This browser does not support microphone capture.";
  const legibilityProbeDisabledReason = supportsGetDisplayMedia(typeof navigator !== "undefined" ? navigator : undefined)
    ? undefined
    : "This browser does not support screen-share capture.";

  // The embedded provider is text-only (see routeRequest) and cannot read
  // files - disable the attach control rather than letting a file get
  // silently ignored. Read directly rather than via the reactive
  // useLlmProvider hook: `mounted` above already guarantees we're past SSR,
  // and this mirrors the same non-reactive check the tone-status effect uses.
  const attachDisabled = getStoredProvider() === "embedded";

  // A7: "the user can see what was loaded". Two sources, preferred in order:
  // (1) knowledgeContextInfo - the SERVER's confirmed includedPages/
  // includedAttachments once a response has come back (see handleSend) -
  // this is the trustworthy number: it reflects A3's ownership re-check and
  // whatever the budget actually fit, so it can legitimately be lower than
  // what was requested. (2) Until that first response lands (context was
  // just loaded via "Ask AI", nothing sent yet), fall back to the client's
  // own requested-selection count/label so the strip appears immediately
  // rather than staying blank for the whole first turn.
  const knowledgeContextPart = knowledgeContextInfo
    ? `${knowledgeContextInfo.includedPages} page${knowledgeContextInfo.includedPages === 1 ? "" : "s"}${
        knowledgeContextInfo.includedAttachments > 0
          ? ` and ${knowledgeContextInfo.includedAttachments} attachment${knowledgeContextInfo.includedAttachments === 1 ? "" : "s"}`
          : ""
      } in context`
    : knowledgeContext
    ? `${
        knowledgeContext.label ??
        `${knowledgeContext.knowledgePageIds.length} page${knowledgeContext.knowledgePageIds.length === 1 ? "" : "s"}`
      } in context`
    : undefined;

  // C4: the Modules-selection half of the strip. There is no server-
  // confirmed-counts companion for this one (see selectionContext's own
  // state comment above for why) - the label was already finalized
  // client-side at click time via selectionContextLabel
  // (src/lib/chat/selection-context.ts), so this is the only source there
  // ever is for it. Falls back to a generic phrase in the (expected-never)
  // case a dispatcher constructed a selectionContext without a label.
  const selectionContextPart = selectionContext
    ? `${selectionContext.label ?? "selected content"} in context`
    : undefined;

  // C4: AiChatWindow keeps its single `knowledgeContextSummary` string prop
  // unchanged (that component is NOT modified for this feature) - so both
  // descriptions have to be combined into the one string here instead of
  // AiChatWindow growing a second prop. Fixed order: knowledge-base context
  // (the older of the two "Ask AI" features) is named first, Modules-
  // selection context second, joined with "; " only when both are present
  // so neither swallows the other. Either half alone renders exactly as it
  // always has; `undefined` (not "") when nothing is loaded, matching this
  // prop's pre-existing "absent means no strip at all" contract.
  const knowledgeContextSummary =
    [knowledgeContextPart, selectionContextPart].filter((part): part is string => Boolean(part)).join("; ") ||
    undefined;

  return (
    <>
      {/* F3/F4/F5/F6 redesign: a five-entry, persistently-labelled Menu
          replacing the old seven-entry SpeedDial - see
          FabQuickActionsMenu.tsx's own header for the full reasoning (why a
          Menu instead of staticTooltipLabel, why keepMounted must stay
          false, why the three former recording-variant entries collapsed
          into one). Every handler here OPENS its destination (F2) - see
          each handleOpen* above for why none of them toggle. */}
      <FabQuickActionsMenu
        bottom={DIAL_BOTTOM}
        right={DIAL_RIGHT}
        onOpenChat={handleOpenChat}
        onOpenLiveClass={handleOpenLiveClass}
        onOpenChecklist={handleOpenChecklist}
        onOpenLegibilityProbe={handleOpenLegibilityProbe}
        onOpenRecordingTools={handleOpenRecordingTools}
        liveClassDisabledReason={liveClassDisabledReason}
        legibilityProbeDisabledReason={legibilityProbeDisabledReason}
      />

      {/* The FAB's own persistent recording indicator (H4 / regression
          90.11): visible for as long as a live-class session is active, even
          while the Live Class window itself is closed AND regardless of
          whether the dial is open or closed - closing the window never stops
          the class (H3), so this is the only thing on screen that keeps
          proving a session is still running.
          Placed BESIDE the Fab (see computeLiveBadgePosition), not above it:
          the dial's actions expand upward from the Fab, so a badge stacked
          above it would end up tangled in that menu - see the fix for the
          collision this used to have with the topmost dial entry. */}
      {isLiveClassSessionActive(liveClass.phase) && (
        <div
          className={styles.fabLiveBadge}
          style={{
            ...computeLiveBadgePosition({ right: DIAL_RIGHT, bottom: DIAL_BOTTOM }, FAB_SIZE, LIVE_BADGE_HEIGHT, LIVE_BADGE_GAP),
            height: LIVE_BADGE_HEIGHT,
          }}
          role="status"
          aria-label={`Live class session in progress - ${formatElapsedCompact(liveClass.elapsedSeconds)} elapsed`}
        >
          <span aria-hidden className={styles.liveRecordingDot} />
          <span className={styles.fabLiveBadgeTime}>{formatElapsedCompact(liveClass.elapsedSeconds)}</span>
        </div>
      )}

      {/* D5/D8's unread-answer badge: a glance-able count on the FAB itself
          for exactly the situation this alerting exists for - the instructor
          is teaching, the Live Class window lives in the FAB and is usually
          CLOSED, and they are not watching the panel. Shown ONLY while the
          window is closed (once it is open, the panel's own "New" markers
          and jump-to-newest affordance take over - see AnswersPanel.tsx),
          and reads the SAME unreadAnswerCount the panel markers and the
          document-title prefix all read (useLiveClassSession.ts) - never a
          second, independently-tracked count. Positioned on the Fab's own
          top-right corner (computeUnreadBadgePosition), distinct from the
          recording pill beside it, since the two report different things
          and may both be visible at once. */}
      {!liveClassOpen && liveClass.unreadAnswerCount > 0 && (
        <div
          className={styles.fabUnreadBadge}
          style={computeUnreadBadgePosition({ right: DIAL_RIGHT, bottom: DIAL_BOTTOM }, FAB_SIZE, UNREAD_BADGE_SIZE)}
          role="status"
          aria-label={`${liveClass.unreadAnswerCount} new live class answer${liveClass.unreadAnswerCount === 1 ? "" : "s"} waiting`}
        >
          {liveClass.unreadAnswerCount > 9 ? "9+" : liveClass.unreadAnswerCount}
        </div>
      )}

      {chatOpen && (
        <AiChatWindow
          messages={messages}
          isLoading={loading}
          error={error}
          title="AI Chatbot"
          icon={<ChatIcon />}
          emptyMessage="Ask me anything!"
          knowledgeContextSummary={knowledgeContextSummary}
          toneStatus={toneStatus}
          suggestions={suggestions}
          attachDisabled={attachDisabled}
          attachDisabledReason="The Embedded Deterministic Engine cannot read files, so attachments are turned off. Switch providers to attach files."
          skippedFiles={skippedFiles}
          position={chatPos}
          onHeaderMouseDown={onChatHeaderMouseDown}
          onSend={handleSend}
          onClose={handleChatClose}
        />
      )}

      {/* Closing this window only hides the UI (setLiveClassOpen(false)) - it
          never calls liveClass.onStop, so an in-progress session keeps
          running, capturing audio and answering questions, exactly as H3
          requires. Reopening renders the same still-running session. */}
      {liveClassOpen && (
        <LiveClassWindow
          session={liveClass}
          position={liveClassPos}
          onHeaderMouseDown={onLiveClassHeaderMouseDown}
          onClose={() => setLiveClassOpen(false)}
        />
      )}

      {/* Mounting this only while open is what makes "every open re-fetches"
          hold true even though open/closed state now persists like the two
          windows above - see the component's own file for the full
          staleness reasoning. */}
      {checklistOverviewOpen && (
        <WeeklyChecklistOverviewModal onClose={() => setChecklistOverviewOpen(false)} />
      )}

      {/* Mounted only while open, same as WeeklyChecklistOverviewModal just
          above - LegibilityProbeModal itself discards its capture and
          transcript on close (see that file's header), so there is no
          staleness concern the checklist's own comment warns about; this
          only controls whether the dialog is on screen at all. */}
      {legibilityProbeOpen && (
        <LegibilityProbeModal onClose={() => setLegibilityProbeOpen(false)} />
      )}
    </>
  );
}

