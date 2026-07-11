/* eslint-disable react-hooks/refs */
"use client";

import { useRef, useEffect, useState } from "react";
import styles from "../../page.module.css";

/**
 * A WYSIWYG HTML editor with visual and source modes.
 * - Visual mode: contentEditable div with a toolbar for formatting
 * - Source mode: textarea for raw HTML editing
 * - All execCommand calls operate on the live HTML, so Canvas formatting round-trips verbatim.
 */
export function HtmlEditor({
  value,
  onChange,
  minHeight = 220,
  ariaLabel,
}: {
  value: string;
  onChange: (html: string) => void;
  minHeight?: number;
  ariaLabel?: string;
}) {
  const editableRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [isSourceMode, setIsSourceMode] = useState(false);
  const lastHtmlRef = useRef<string>(value);

  // Seed the contentEditable when the incoming value differs from what we last emitted.
  // Only update if not focused to prevent caret jumps.
  useEffect(() => {
    if (isSourceMode) return;
    const editable = editableRef.current;
    if (!editable) return;
    if (value === lastHtmlRef.current) return;
    if (document.activeElement === editable) return;
    editable.innerHTML = value;
    lastHtmlRef.current = value;
  }, [value, isSourceMode]);

  const emitChange = (html: string) => {
    lastHtmlRef.current = html;
    onChange(html);
  };

  const handleEditableInput = () => {
    const editable = editableRef.current;
    if (editable) {
      emitChange(editable.innerHTML);
    }
  };

  const handleSourceChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    emitChange(e.target.value);
  };

  // When switching to source mode, seed the textarea with the current HTML.
  useEffect(() => {
    if (isSourceMode && textareaRef.current) {
      textareaRef.current.value = editableRef.current?.innerHTML ?? value;
    }
  }, [isSourceMode, value]);

  // When switching back to visual mode, update the editable from the textarea.
  const handleToggleSourceMode = () => {
    if (isSourceMode && textareaRef.current && editableRef.current) {
      editableRef.current.innerHTML = textareaRef.current.value;
      lastHtmlRef.current = textareaRef.current.value;
    }
    setIsSourceMode(!isSourceMode);
  };

  const execCmd = (command: string, value?: string) => {
    const editable = editableRef.current;
    if (!editable) return;
    if (document.activeElement !== editable) {
      editable.focus();
    }
    document.execCommand(command, false, value);
    emitChange(editable.innerHTML);
  };

  const handleBlockFormat = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const tag = e.target.value;
    if (tag) {
      execCmd("formatBlock", tag);
    }
  };

  const handleLink = () => {
    const url = window.prompt("Link URL:");
    if (url) {
      execCmd("createLink", url);
    }
  };

  const handleImage = () => {
    const url = window.prompt("Image URL:");
    if (url) {
      execCmd("insertImage", url);
    }
  };

  const handleTable = () => {
    const tableHtml = `<table style="border-collapse: collapse; width: 100%;">
      <tr>
        <th style="border: 1px solid #cbd5e1; padding: 6px;">Header 1</th>
        <th style="border: 1px solid #cbd5e1; padding: 6px;">Header 2</th>
        <th style="border: 1px solid #cbd5e1; padding: 6px;">Header 3</th>
      </tr>
      <tr>
        <td style="border: 1px solid #cbd5e1; padding: 6px;">Cell</td>
        <td style="border: 1px solid #cbd5e1; padding: 6px;">Cell</td>
        <td style="border: 1px solid #cbd5e1; padding: 6px;">Cell</td>
      </tr>
    </table>`;
    execCmd("insertHTML", tableHtml);
  };

  const handleTextColor = (color: string) => {
    execCmd("foreColor", color);
  };

  const handleHighlight = (color: string) => {
    if (color === "none") {
      execCmd("hiliteColor", "transparent");
    } else {
      execCmd("hiliteColor", color);
    }
  };

  const toolbarBtn = (label: string, title: string, onClick: () => void) => (
    <button
      type="button"
      className={styles.rteToolbarBtn}
      title={title}
      onMouseDown={(e) => {
        e.preventDefault();
        onClick();
      }}
    >
      {label}
    </button>
  );

  const textColorSwatches = [
    { color: "#0f172a", label: "Black" },
    { color: "#dc2626", label: "Red" },
    { color: "#d97706", label: "Orange" },
    { color: "#16a34a", label: "Green" },
    { color: "#2563eb", label: "Blue" },
    { color: "#7c3aed", label: "Purple" },
  ];

  const highlightSwatches = [
    { color: "#fef08a", label: "Yellow" },
    { color: "#bbf7d0", label: "Green" },
    { color: "none", label: "None" },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {!isSourceMode && (
        <div className={styles.rteToolbar} role="toolbar" aria-label="Text formatting">
          <select
            className={styles.rteSizeSelect}
            onChange={handleBlockFormat}
            defaultValue=""
            title="Block format"
          >
            <option value="">Format</option>
            <option value="p">Paragraph</option>
            <option value="h2">Heading 2</option>
            <option value="h3">Heading 3</option>
            <option value="h4">Heading 4</option>
            <option value="blockquote">Quote</option>
            <option value="pre">Code</option>
          </select>

          <span className={styles.rteToolbarSep} aria-hidden="true" />

          {toolbarBtn("B", "Bold (Ctrl+B)", () => execCmd("bold"))}
          {toolbarBtn("I", "Italic (Ctrl+I)", () => execCmd("italic"))}
          {toolbarBtn("U", "Underline (Ctrl+U)", () => execCmd("underline"))}
          {toolbarBtn("S", "Strikethrough", () => execCmd("strikeThrough"))}

          <span className={styles.rteToolbarSep} aria-hidden="true" />

          {toolbarBtn("List", "Bulleted list", () => execCmd("insertUnorderedList"))}
          {toolbarBtn("1.", "Numbered list", () => execCmd("insertOrderedList"))}
          {toolbarBtn("↔", "Indent", () => execCmd("indent"))}
          {toolbarBtn("↤", "Outdent", () => execCmd("outdent"))}

          <span className={styles.rteToolbarSep} aria-hidden="true" />

          {toolbarBtn("←", "Align left", () => execCmd("justifyLeft"))}
          {toolbarBtn("↑", "Align center", () => execCmd("justifyCenter"))}
          {toolbarBtn("→", "Align right", () => execCmd("justifyRight"))}

          <span className={styles.rteToolbarSep} aria-hidden="true" />

          {toolbarBtn("Link", "Insert or edit link", handleLink)}
          {toolbarBtn("Unlink", "Remove link", () => execCmd("unlink"))}
          {toolbarBtn("Image", "Insert image", handleImage)}
          {toolbarBtn("Table", "Insert table", handleTable)}

          <span className={styles.rteToolbarSep} aria-hidden="true" />

          <div style={{ display: "flex", gap: 2, alignItems: "center" }}>
            <span style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>Text:</span>
            {textColorSwatches.map((swatch) => (
              <button
                key={swatch.color}
                type="button"
                title={`Text color: ${swatch.label}`}
                onMouseDown={(e) => {
                  e.preventDefault();
                  handleTextColor(swatch.color);
                }}
                style={{
                  width: 16,
                  height: 16,
                  padding: 0,
                  border: "1px solid #999",
                  backgroundColor: swatch.color,
                  cursor: "pointer",
                  borderRadius: 2,
                }}
              />
            ))}
          </div>

          <div style={{ display: "flex", gap: 2, alignItems: "center" }}>
            <span style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>Highlight:</span>
            {highlightSwatches.map((swatch) => (
              <button
                key={swatch.color}
                type="button"
                title={`Highlight: ${swatch.label}`}
                onMouseDown={(e) => {
                  e.preventDefault();
                  handleHighlight(swatch.color);
                }}
                style={{
                  width: 16,
                  height: 16,
                  padding: 0,
                  border: "1px solid #999",
                  backgroundColor: swatch.color === "none" ? "transparent" : swatch.color,
                  cursor: "pointer",
                  borderRadius: 2,
                }}
              />
            ))}
          </div>

          <span className={styles.rteToolbarSep} aria-hidden="true" />

          {toolbarBtn("---", "Horizontal rule", () => execCmd("insertHorizontalRule"))}
          {toolbarBtn("Clear", "Clear formatting", () => execCmd("removeFormat"))}

          <span style={{ flex: 1 }} />

          {toolbarBtn("HTML", "Toggle source mode", handleToggleSourceMode)}
        </div>
      )}

      {isSourceMode ? (
        <textarea
          ref={textareaRef}
          value={value}
          onChange={handleSourceChange}
          style={{
            width: "100%",
            minHeight: `${minHeight}px`,
            padding: "10px 12px",
            border: "1px solid var(--field-border)",
            borderRadius: 8,
            backgroundColor: "var(--field-background)",
            color: "var(--text-primary)",
            fontFamily: "var(--font-mono, monospace)",
            fontSize: "0.9rem",
            lineHeight: 1.5,
            resize: "vertical",
            overflowY: "auto",
          }}
          spellCheck="false"
          aria-label={ariaLabel}
        />
      ) : (
        <div
          ref={editableRef}
          contentEditable
          suppressContentEditableWarning
          onInput={handleEditableInput}
          style={{
            width: "100%",
            minHeight: `${minHeight}px`,
            padding: "10px 12px",
            border: "1px solid var(--field-border)",
            borderRadius: 8,
            backgroundColor: "var(--field-background)",
            color: "var(--text-primary)",
            lineHeight: 1.5,
            overflowY: "auto",
            outline: "none",
          }}
          aria-label={ariaLabel}
          role="textbox"
          aria-multiline="true"
        >
          {value}
        </div>
      )}

      <style>{`
        div[contenteditable] img {
          max-width: 100%;
          height: auto;
        }
      `}</style>
    </div>
  );
}
