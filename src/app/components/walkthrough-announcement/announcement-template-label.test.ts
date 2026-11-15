import { expect, it } from "vitest";
import { encodePreviousAnnouncementHtml } from "@/lib/announcement-library-rich-text";
import { announcementTemplateLabel, announcementTemplateLabels } from "./announcement-template-label";

it("uses the saved label when present", () => {
  expect(announcementTemplateLabel({ label: "Week 2", createdAt: "2026-01-01", exemplarText: "Other content" })).toBe("Week 2");
});

it("makes unlabeled formatted announcements identifiable and searchable", () => {
  const exemplarText = encodePreviousAnnouncementHtml('<p><strong>Welcome to databases</strong> and SQL</p>');
  const label = announcementTemplateLabel({ label: null, createdAt: "2026-01-01", exemplarText });
  expect(label).toContain("Welcome to databases");
  expect(label).not.toContain("<strong>");
});

it("distinguishes duplicate names and dates without exposing IDs", () => {
  const entries = [
    { id: "secret-one", label: "Week 1", createdAt: "2026-01-01", exemplarText: "A" },
    { id: "secret-two", label: "Week 1", createdAt: "2026-01-01", exemplarText: "B" },
  ];
  const labels = announcementTemplateLabels(entries);
  expect(labels.get("secret-one")).not.toBe(labels.get("secret-two"));
  expect([...labels.values()].join(" ")).not.toContain("secret");
});
