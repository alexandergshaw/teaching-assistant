"use client";

import { useEffect, useRef } from "react";
import { Box, Button, Stack } from "@mui/material";
import { recordingClipboardContent, sanitizeRecordingAnnouncementHtml } from "@/lib/recording-announcement-html";

/** Edits the same allowlisted HTML that the posting action sends to Canvas. */
export default function RecordingAnnouncementEditor({ value, onChange, disabled = false }: { value: string; onChange: (html: string) => void; disabled?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const selectionRef = useRef<Range | null>(null);
  useEffect(() => {
    if (ref.current && document.activeElement !== ref.current) {
      const safe = sanitizeRecordingAnnouncementHtml(value);
      if (sanitizeRecordingAnnouncementHtml(ref.current.innerHTML) !== safe) ref.current.innerHTML = safe;
    }
  }, [value]);
  const emit = () => { if (ref.current) onChange(sanitizeRecordingAnnouncementHtml(ref.current.innerHTML)); };
  const rememberSelection = () => {
    const selection = window.getSelection();
    if (selection?.rangeCount && ref.current?.contains(selection.anchorNode) && ref.current.contains(selection.focusNode)) {
      selectionRef.current = selection.getRangeAt(0).cloneRange();
    }
  };
  const command = (name: string, argument?: string) => {
    if (disabled) return;
    ref.current?.focus();
    const selection = window.getSelection();
    if (selectionRef.current && ref.current?.contains(selectionRef.current.commonAncestorContainer) && selection) {
      selection.removeAllRanges();
      selection.addRange(selectionRef.current);
    }
    document.execCommand(name, false, argument);
    rememberSelection();
    emit();
  };
  const button = (label: string, commandName: string, argument?: string) => (
    <Button size="small" type="button" disabled={disabled} onMouseDown={event => event.preventDefault()} onClick={() => command(commandName, argument)}>{label}</Button>
  );
  return <Box onBlur={event => {
    if (event.relatedTarget instanceof Node && event.currentTarget.contains(event.relatedTarget)) return;
    if (ref.current) {
      const safe = sanitizeRecordingAnnouncementHtml(ref.current.innerHTML);
      if (ref.current.innerHTML !== safe) ref.current.innerHTML = safe;
      selectionRef.current = null;
      onChange(safe);
    }
  }}>
    <Stack direction="row" sx={{ flexWrap: "wrap" }} aria-label="Announcement formatting">
      {button("Paragraph", "formatBlock", "p")}{button("Heading", "formatBlock", "h2")}
      {button("Bold", "bold")}{button("Italic", "italic")}
      {button("Bulleted list", "insertUnorderedList")}{button("Numbered list", "insertOrderedList")}
    </Stack>
    <Box component="div" ref={ref} contentEditable={!disabled} suppressContentEditableWarning role="textbox" aria-label="Announcement message" aria-multiline="true" aria-disabled={disabled}
      onInput={emit} onKeyUp={rememberSelection} onMouseUp={rememberSelection} onBlur={() => { rememberSelection(); emit(); }}
      onPaste={event => { event.preventDefault(); const content = recordingClipboardContent(event.clipboardData.getData("text/html"), event.clipboardData.getData("text/plain")); document.execCommand(content.command, false, content.value); emit(); }}
      onDrop={event => event.preventDefault()}
      sx={{ minHeight: 180, border: 1, borderColor: "divider", borderRadius: 1, p: 1.5, overflowWrap: "anywhere" }} />
  </Box>;
}
