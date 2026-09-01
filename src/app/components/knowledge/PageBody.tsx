"use client";

// Renders a knowledge-base page's Markdown body (AC2 of the attach/embed
// feature): plain-Markdown runs go through the existing markdownToHtml
// block renderer unchanged (src/lib/markdown.ts), and attachment:// embed
// references (see attachment-embed.ts) are resolved to a live signed URL
// and rendered as an inline image or a file card in place.
//
// Signed URLs are resolved HERE, on render, never stored - see
// src/lib/institution-page-attachments.ts's getInstitutionPageAttachmentUrl
// docstring for why baking one into saved markdown would break permanently
// and silently once it expired.

import { useEffect, useState } from "react";
import {
  classifyAttachmentKind,
  formatByteSize,
  type InstitutionPageAttachment,
} from "@/lib/institution-page-attachments";
import { getInstitutionPageAttachmentUrlAction } from "../../actions";
import { markdownToHtml } from "@/lib/markdown";
import { splitBodyIntoSegments } from "./attachment-embed";
import styles from "../../page.module.css";
import kbStyles from "../KnowledgeTab.module.css";

interface PageBodyProps {
  body: string;
  /** null while the page's attachment list is still loading - distinguishes
   * "not resolved yet" from "this id genuinely is not one of this page's
   * attachments" so an embed never flashes "missing" before the list has
   * even had a chance to load. */
  attachments: InstitutionPageAttachment[] | null;
}

export default function PageBody({ body, attachments }: PageBodyProps) {
  const segments = splitBodyIntoSegments(body);
  const attachmentsLoaded = attachments !== null;
  const list = attachments ?? [];

  return (
    <div className={styles.kbBody}>
      {segments.map((segment, i) =>
        segment.type === "markdown" ? (
          <div key={i} dangerouslySetInnerHTML={{ __html: markdownToHtml(segment.text) }} />
        ) : (
          <EmbedBlock
            key={`${segment.attachmentId}-${i}`}
            label={segment.label}
            attachment={list.find((a) => a.id === segment.attachmentId) ?? null}
            attachmentsLoaded={attachmentsLoaded}
          />
        )
      )}
    </div>
  );
}

type ResolveState = { status: "loading" } | { status: "ready"; url: string } | { status: "error"; message: string };

function EmbedBlock({
  label,
  attachment,
  attachmentsLoaded,
}: {
  label: string;
  attachment: InstitutionPageAttachment | null;
  attachmentsLoaded: boolean;
}) {
  const [resolved, setResolved] = useState<ResolveState>({ status: "loading" });

  useEffect(() => {
    if (!attachment) return;
    let cancelled = false;
    (async () => {
      const result = await getInstitutionPageAttachmentUrlAction(attachment.id);
      if (cancelled) return;
      if ("error" in result) {
        setResolved({ status: "error", message: result.error });
        return;
      }
      setResolved({ status: "ready", url: result.url });
    })();
    return () => {
      cancelled = true;
    };
  }, [attachment]);

  if (!attachment) {
    return (
      <div className={kbStyles.embedBroken}>
        {attachmentsLoaded
          ? `Attachment "${label}" is no longer available - it may have been removed.`
          : "Loading attachment…"}
      </div>
    );
  }

  const kind = classifyAttachmentKind(attachment.mimeType);
  const caption = label || attachment.fileName;

  if (kind === "image") {
    return (
      <figure className={kbStyles.embedImage}>
        {resolved.status === "ready" ? (
          // Plain img: the source is a short-lived signed Storage URL,
          // which next/image cannot fetch or optimize without a configured
          // remote pattern for a per-user Supabase project domain.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={resolved.url} alt={caption} />
        ) : resolved.status === "error" ? (
          <div className={kbStyles.embedError}>
            Could not load &ldquo;{attachment.fileName}&rdquo;: {resolved.message}
          </div>
        ) : (
          <div className={kbStyles.embedLoading}>Loading {attachment.fileName}…</div>
        )}
        <figcaption className={kbStyles.embedCaption}>{caption}</figcaption>
      </figure>
    );
  }

  return (
    <div className={kbStyles.embedCard}>
      <div className={kbStyles.embedCardInfo}>
        <span className={kbStyles.embedCardName}>{caption}</span>
        <span className={kbStyles.embedCardMeta}>{formatByteSize(attachment.sizeBytes)}</span>
      </div>
      {resolved.status === "ready" ? (
        <a className={kbStyles.embedCardLink} href={resolved.url} target="_blank" rel="noreferrer">
          Open
        </a>
      ) : resolved.status === "error" ? (
        <span className={kbStyles.embedError}>{resolved.message}</span>
      ) : (
        <span className={kbStyles.embedCardMeta}>Loading…</span>
      )}
    </div>
  );
}
