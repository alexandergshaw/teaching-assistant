"use client";
import { useEffect, useRef } from "react";
import { Box } from "@mui/material";
import { encodePreviousAnnouncementHtml, previousAnnouncementHtml, sanitizePreviousAnnouncementHtml } from "@/lib/announcement-library-rich-text";

export default function PreviousAnnouncementEditor({ value, onChange, disabled, label, inputRef }: {
  value: string; onChange: (value: string) => void; disabled: boolean; label: string; inputRef: (node: HTMLDivElement | null) => void;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const node = ref.current;
    if (node && document.activeElement !== node) {
      const html = previousAnnouncementHtml(value);
      if (node.innerHTML !== html) node.innerHTML = html;
    }
  }, [value]);
  const emit = () => { if (ref.current) onChange(encodePreviousAnnouncementHtml(ref.current.innerHTML)); };
  return <Box component="div" ref={(node: HTMLDivElement | null) => { ref.current = node; inputRef(node); }}
    contentEditable={!disabled} suppressContentEditableWarning role="textbox" aria-label={label} aria-multiline="true" aria-disabled={disabled}
    onInput={emit} onBlur={() => { if (ref.current) { ref.current.innerHTML = sanitizePreviousAnnouncementHtml(ref.current.innerHTML); emit(); } }}
    onPaste={event => {
      event.preventDefault();
      const html = event.clipboardData.getData("text/html");
      if (html) document.execCommand("insertHTML", false, sanitizePreviousAnnouncementHtml(html));
      else document.execCommand("insertText", false, event.clipboardData.getData("text/plain"));
      emit();
    }}
    onDrop={event => event.preventDefault()}
    sx={{ minHeight: 144, border: 1, borderColor: "divider", borderRadius: 1, p: 1.5, overflowWrap: "anywhere", "&:focus-visible": { outline: 2, outlineColor: "primary.main" } }} />;
}
