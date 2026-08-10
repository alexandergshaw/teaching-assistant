import { describe, it, expect, vi, beforeEach } from "vitest";

// Every action here calls requireOwner() (auth), getInstitutionPage (to turn
// a missing/foreign page id into a clean error before touching attachments),
// and the src/lib/institution-page-attachments data-access functions - all
// mocked so each action's own wiring (owner gate, existence checks, error
// mapping) runs for real without a live Supabase session. The underlying
// caps/path/mapper logic is unit-tested directly in
// src/lib/institution-page-attachments.test.ts. Mirrors
// src/app/actions/knowledge-base.test.ts's pattern.
vi.mock("@/lib/supabase/auth", () => ({
  requireOwner: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createServiceClient: vi.fn(() => ({})),
}));

vi.mock("@/lib/knowledge-base", () => ({
  getInstitutionPage: vi.fn(),
}));

vi.mock("@/lib/institution-page-attachments", () => ({
  listInstitutionPageAttachments: vi.fn(),
  getInstitutionPageAttachment: vi.fn(),
  insertInstitutionPageAttachmentRow: vi.fn(),
  deleteInstitutionPageAttachment: vi.fn(),
  getInstitutionPageAttachmentUrl: vi.fn(),
}));

import { requireOwner } from "@/lib/supabase/auth";
import { getInstitutionPage } from "@/lib/knowledge-base";
import {
  listInstitutionPageAttachments,
  getInstitutionPageAttachment,
  insertInstitutionPageAttachmentRow,
  deleteInstitutionPageAttachment,
  getInstitutionPageAttachmentUrl,
  type InstitutionPageAttachment,
} from "@/lib/institution-page-attachments";
import type { InstitutionPage } from "@/lib/knowledge-base";
import {
  listInstitutionPageAttachmentsAction,
  uploadInstitutionPageAttachmentAction,
  deleteInstitutionPageAttachmentAction,
  getInstitutionPageAttachmentUrlAction,
} from "./institution-page-attachments";

const OWNER = { id: "owner-1", email: "owner@example.com" };

function page(overrides: Partial<InstitutionPage> = {}): InstitutionPage {
  return {
    id: "page-1",
    institution: "MCC",
    parentId: null,
    title: "Attendance Policy",
    body: "Students must attend 80% of sessions.",
    tags: [],
    position: 0,
    createdAt: "2026-08-01T00:00:00Z",
    updatedAt: "2026-08-01T00:00:00Z",
    ...overrides,
  };
}

function attachment(overrides: Partial<InstitutionPageAttachment> = {}): InstitutionPageAttachment {
  return {
    id: "attach-1",
    pageId: "page-1",
    fileName: "handbook.pdf",
    mimeType: "application/pdf",
    sizeBytes: 4096,
    storagePath: "owner-1/page-1/attach-1.pdf",
    createdAt: "2026-08-01T00:00:00Z",
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requireOwner).mockResolvedValue(OWNER);
});

describe("listInstitutionPageAttachmentsAction", () => {
  it("returns an error rather than throwing when requireOwner rejects", async () => {
    vi.mocked(requireOwner).mockRejectedValueOnce(new Error("Not authorized."));

    const result = await listInstitutionPageAttachmentsAction("page-1");

    expect(result).toEqual({ error: "Not authorized." });
    expect(getInstitutionPage).not.toHaveBeenCalled();
  });

  it("returns 'Page not found.' for a missing or foreign page id, never listing attachments", async () => {
    vi.mocked(getInstitutionPage).mockResolvedValueOnce(null);

    const result = await listInstitutionPageAttachmentsAction("not-mine");

    expect(result).toEqual({ error: "Page not found." });
    expect(listInstitutionPageAttachments).not.toHaveBeenCalled();
  });

  it("returns the owner's attachments for an owned page", async () => {
    vi.mocked(getInstitutionPage).mockResolvedValueOnce(page());
    vi.mocked(listInstitutionPageAttachments).mockResolvedValueOnce([attachment(), attachment({ id: "attach-2" })]);

    const result = await listInstitutionPageAttachmentsAction("page-1");

    expect("error" in result).toBe(false);
    if ("error" in result) return;
    expect(result.attachments).toHaveLength(2);
    expect(listInstitutionPageAttachments).toHaveBeenCalledWith(expect.anything(), OWNER.id, "page-1");
  });

  it("maps a thrown data-layer error to {error} instead of throwing", async () => {
    vi.mocked(getInstitutionPage).mockResolvedValueOnce(page());
    vi.mocked(listInstitutionPageAttachments).mockRejectedValueOnce(new Error("db unreachable"));

    const result = await listInstitutionPageAttachmentsAction("page-1");

    expect(result).toEqual({ error: "db unreachable" });
  });
});

describe("uploadInstitutionPageAttachmentAction", () => {
  // AC5 item 20: a test proving the browser path sends NO base64 - this
  // action's input is metadata only, never a base64 payload. See
  // AttachmentsPanel.tsx and uploadInstitutionPageAttachment
  // (src/lib/institution-page-attachments.ts) for where the object itself
  // gets uploaded, direct to Storage, before this action ever runs.
  function meta(overrides: Partial<Parameters<typeof uploadInstitutionPageAttachmentAction>[1]> = {}) {
    return {
      id: "attach-new",
      name: "notes.txt",
      mimeType: "text/plain",
      sizeBytes: 5,
      storagePath: "owner-1/page-1/attach-new.txt",
      ...overrides,
    };
  }

  it("returns an error when requireOwner rejects, without touching the data layer", async () => {
    vi.mocked(requireOwner).mockRejectedValueOnce(new Error("Not authorized."));

    const result = await uploadInstitutionPageAttachmentAction("page-1", meta());

    expect(result).toEqual({ error: "Not authorized." });
    expect(insertInstitutionPageAttachmentRow).not.toHaveBeenCalled();
  });

  it("returns 'Page not found.' for a missing or foreign page id, never recording a row", async () => {
    vi.mocked(getInstitutionPage).mockResolvedValueOnce(null);

    const result = await uploadInstitutionPageAttachmentAction("not-mine", meta());

    expect(result).toEqual({ error: "Page not found." });
    expect(insertInstitutionPageAttachmentRow).not.toHaveBeenCalled();
  });

  it("rejects a missing/blank attachment id before ever touching the data layer", async () => {
    const result = await uploadInstitutionPageAttachmentAction("page-1", meta({ id: "  " }));

    expect(result).toEqual({ error: "An attachment id is required." });
    expect(requireOwner).not.toHaveBeenCalled();
    expect(insertInstitutionPageAttachmentRow).not.toHaveBeenCalled();
  });

  it("rejects a missing/blank storage path before ever touching the data layer", async () => {
    const result = await uploadInstitutionPageAttachmentAction("page-1", meta({ storagePath: "" }));

    expect(result).toEqual({ error: "A storage path is required." });
    expect(requireOwner).not.toHaveBeenCalled();
    expect(insertInstitutionPageAttachmentRow).not.toHaveBeenCalled();
  });

  it("records the size the browser reported, verbatim - never recomputes it", async () => {
    vi.mocked(getInstitutionPage).mockResolvedValueOnce(page());
    vi.mocked(insertInstitutionPageAttachmentRow).mockResolvedValueOnce(attachment({ sizeBytes: 20_000_000 }));

    await uploadInstitutionPageAttachmentAction("page-1", meta({ sizeBytes: 20_000_000 }));

    expect(insertInstitutionPageAttachmentRow).toHaveBeenCalledWith(
      expect.anything(),
      OWNER.id,
      "page-1",
      expect.objectContaining({ fileName: "notes.txt", mimeType: "text/plain", sizeBytes: 20_000_000 })
    );
  });

  it("passes the id and storage path the browser already wrote through, unmodified", async () => {
    vi.mocked(getInstitutionPage).mockResolvedValueOnce(page());
    vi.mocked(insertInstitutionPageAttachmentRow).mockResolvedValueOnce(attachment());

    await uploadInstitutionPageAttachmentAction(
      "page-1",
      meta({ id: "attach-fixed", storagePath: "owner-1/page-1/attach-fixed.txt" })
    );

    expect(insertInstitutionPageAttachmentRow).toHaveBeenCalledWith(
      expect.anything(),
      OWNER.id,
      "page-1",
      expect.objectContaining({ id: "attach-fixed", storagePath: "owner-1/page-1/attach-fixed.txt" })
    );
  });

  it("returns the recorded attachment on success", async () => {
    vi.mocked(getInstitutionPage).mockResolvedValueOnce(page());
    vi.mocked(insertInstitutionPageAttachmentRow).mockResolvedValueOnce(attachment({ id: "attach-new" }));

    const result = await uploadInstitutionPageAttachmentAction("page-1", meta());

    expect("error" in result).toBe(false);
    if ("error" in result) return;
    expect(result.attachment.id).toBe("attach-new");
  });

  it("surfaces a cap-refusal error from the data layer (e.g. the count cap) instead of throwing", async () => {
    vi.mocked(getInstitutionPage).mockResolvedValueOnce(page());
    vi.mocked(insertInstitutionPageAttachmentRow).mockRejectedValueOnce(
      new Error("This page already has 30 attachments, the maximum allowed per page.")
    );

    const result = await uploadInstitutionPageAttachmentAction("page-1", meta({ name: "huge.zip" }));

    expect(result).toEqual({ error: "This page already has 30 attachments, the maximum allowed per page." });
  });
});

describe("deleteInstitutionPageAttachmentAction", () => {
  it("returns an error when requireOwner rejects, without touching the data layer", async () => {
    vi.mocked(requireOwner).mockRejectedValueOnce(new Error("Not authorized."));

    const result = await deleteInstitutionPageAttachmentAction("attach-1");

    expect(result).toEqual({ error: "Not authorized." });
    expect(deleteInstitutionPageAttachment).not.toHaveBeenCalled();
  });

  it("returns 'Attachment not found.' for a missing or foreign id, never deleting", async () => {
    vi.mocked(getInstitutionPageAttachment).mockResolvedValueOnce(null);

    const result = await deleteInstitutionPageAttachmentAction("not-mine");

    expect(result).toEqual({ error: "Attachment not found." });
    expect(deleteInstitutionPageAttachment).not.toHaveBeenCalled();
  });

  it("deletes an existing owned attachment", async () => {
    const existing = attachment();
    vi.mocked(getInstitutionPageAttachment).mockResolvedValueOnce(existing);
    vi.mocked(deleteInstitutionPageAttachment).mockResolvedValueOnce(undefined);

    const result = await deleteInstitutionPageAttachmentAction("attach-1");

    expect(result).toEqual({ ok: true });
    expect(deleteInstitutionPageAttachment).toHaveBeenCalledWith(expect.anything(), OWNER.id, existing);
  });

  it("maps a thrown data-layer error to {error} instead of throwing", async () => {
    vi.mocked(getInstitutionPageAttachment).mockResolvedValueOnce(attachment());
    vi.mocked(deleteInstitutionPageAttachment).mockRejectedValueOnce(new Error("delete failed"));

    const result = await deleteInstitutionPageAttachmentAction("attach-1");

    expect(result).toEqual({ error: "delete failed" });
  });
});

describe("getInstitutionPageAttachmentUrlAction", () => {
  it("returns an error when requireOwner rejects, without touching the data layer", async () => {
    vi.mocked(requireOwner).mockRejectedValueOnce(new Error("Not authorized."));

    const result = await getInstitutionPageAttachmentUrlAction("attach-1");

    expect(result).toEqual({ error: "Not authorized." });
    expect(getInstitutionPageAttachmentUrl).not.toHaveBeenCalled();
  });

  it("returns 'Attachment not found.' for a missing or foreign id", async () => {
    vi.mocked(getInstitutionPageAttachment).mockResolvedValueOnce(null);

    const result = await getInstitutionPageAttachmentUrlAction("not-mine");

    expect(result).toEqual({ error: "Attachment not found." });
    expect(getInstitutionPageAttachmentUrl).not.toHaveBeenCalled();
  });

  it("returns a signed URL and its expiry for an owned attachment", async () => {
    vi.mocked(getInstitutionPageAttachment).mockResolvedValueOnce(attachment());
    vi.mocked(getInstitutionPageAttachmentUrl).mockResolvedValueOnce("https://example.com/signed-abc");

    const result = await getInstitutionPageAttachmentUrlAction("attach-1");

    expect(result).toEqual({ url: "https://example.com/signed-abc", expiresInSeconds: 3600 });
  });

  it("maps a thrown data-layer error to {error} instead of throwing", async () => {
    vi.mocked(getInstitutionPageAttachment).mockResolvedValueOnce(attachment());
    vi.mocked(getInstitutionPageAttachmentUrl).mockRejectedValueOnce(new Error("sign failed"));

    const result = await getInstitutionPageAttachmentUrlAction("attach-1");

    expect(result).toEqual({ error: "sign failed" });
  });
});
