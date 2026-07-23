import type { ScreenCaption } from "@/app/actions";
import type { CaptionPosition } from "@/lib/caption-burn";
import { vttLineSetting } from "@/lib/caption-burn";
import { vttTime } from "./formatting";

export type EditableCaption = ScreenCaption & { position?: CaptionPosition };

export function gatherRecordingContext(): { text: string; summary: string; cardSeconds: number } {
  if (typeof window === "undefined") return { text: "", summary: "", cardSeconds: 0 };
  const get = (k: string) => (localStorage.getItem(k) ?? "").trim();
  const topic = get("ta-rec-script-topic");
  const objectives = get("ta-rec-script-objectives");
  const script = get("ta-rec-script");
  const cardTitle = get("ta-rec-card-title");
  const cardSubtitle = get("ta-rec-card-subtitle");
  const cardClosing = get("ta-rec-card-closing");
  const cardsOn = localStorage.getItem("ta-rec-cards") === "1";
  const cardSecs = Number(localStorage.getItem("ta-rec-card-secs") ?? "3");
  const sections: string[] = [];
  const found: string[] = [];
  if (topic) {
    sections.push(`Lecture topic: ${topic}`);
    found.push(`topic "${topic.slice(0, 40)}"`);
  }
  if (objectives) {
    sections.push(`Objectives: ${objectives}`);
    found.push("objectives");
  }
  if (cardTitle || cardSubtitle) {
    sections.push(`Video title card: ${[cardTitle, cardSubtitle].filter(Boolean).join(" - ")}`);
    found.push("title card");
  }
  if (cardClosing) {
    sections.push(`Closing card: ${cardClosing}`);
    found.push("closing card");
  }
  if (cardsOn) {
    sections.push(`Video structure: the recording begins with a title card shown for about ${cardSecs} seconds before the lecture content starts, and ends with a closing card of the same length. Caption timestamps must account for this - the first content caption should start after the title card.`);
    found.push(`title/closing cards (${cardSecs}s)`);
  }
  if (script) {
    const words = script.split(/\s+/).filter(Boolean).length;
    sections.push(`Lecture script the author wrote for this material (may describe what the video shows):\n${script.slice(0, 1500)}${script.length > 1500 ? "..." : ""}`);
    found.push(`lecture script (${words} words)`);
  }
  return { text: sections.join("\n\n"), summary: found.join(", "), cardSeconds: cardsOn ? cardSecs : 0 };
}

export function buildVttContent(captions: EditableCaption[]): string {
  const lines = ["WEBVTT", ""];
  for (let i = 0; i < captions.length; i++) {
    const c = captions[i];
    lines.push(`${i + 1}`);
    const positionSetting = vttLineSetting(c.position);
    lines.push(`${vttTime(c.start)} --> ${vttTime(c.end)}${positionSetting}`);
    lines.push(c.text);
    lines.push("");
  }
  return lines.join("\n");
}
