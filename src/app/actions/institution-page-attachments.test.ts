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
  createInstitutionPageAttachment: vi.fn(),
  deleteInstitutionPageAttachment: vi.fn(),
  getInstitutionPageAttachmentUrl: vi.fn(),
}));

import { requireOwner } from "@/lib/supabase/auth";
import { getInstitutionPage } from "@/lib/knowledge-base";
import {
  listInstitutionPageAttachments,
  getInstitutionPageAttachment,
  createInstitutionPageAttachment,
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
  it("returns an error when requireOwner rejects, without touching the data layer", async () => {
    vi.mocked(requireOwner).mockRejectedValueOnce(new Error("Not authorized."));

    const result = await uploadInstitutionPageAttachmentAction("page-1", {
      name: "notes.txt",
      base64: Buffer.from("hello").toString("base64"),
      mimeType: "text/plain",
    });

    expect(result).toEqual({ error: "Not authorized." });
    expect(createInstitutionPageAttachment).not.toHaveBeenCalled();
  });

  it("returns 'Page not found.' for a missing or foreign page id, never uploading", async () => {
    vi.mocked(getInstitutionPage).mockResolvedValueOnce(null);

    const result = await uploadInstitutionPageAttachmentAction("not-mine", {
      name: "notes.txt",
      base64: Buffer.from("hello").toString("base64"),
      mimeType: "text/plain",
    });

    expect(result).toEqual({ error: "Page not found." });
    expect(createInstitutionPageAttachment).not.toHaveBeenCalled();
  });

  it("computes sizeBytes from the DECODED base64 payload, not the encoded string length", async () => {
    vi.mocked(getInstitutionPage).mockResolvedValueOnce(page());
    vi.mocked(createInstitutionPageAttachment).mockResolvedValueOnce(attachment());

    const decoded = "hello world"; // 11 bytes decoded
    const base64 = Buffer.from(decoded).toString("base64"); // longer encoded

    await uploadInstitutionPageAttachmentAction("page-1", {
      name: "notes.txt",
      base64,
      mimeType: "text/plain",
    });

    expect(createInstitutionPageAttachment).toHaveBeenCalledWith(
      expect.anything(),
      OWNER.id,
      "page-1",
      expect.anything(),
      expect.objectContaining({ fileName: "notes.txt", mimeType: "text/plain", sizeBytes: decoded.length })
    );
  });

  it("returns the created attachment on success", async () => {
    vi.mocked(getInstitutionPage).mockResolvedValueOnce(page());
    vi.mocked(createInstitutionPageAttachment).mockResolvedValueOnce(attachment({ id: "attach-new" }));

    const result = await uploadInstitutionPageAttachmentAction("page-1", {
      name: "notes.txt",
      base64: Buffer.from("hello").toString("base64"),
      mimeType: "text/plain",
    });

    expect("error" in result).toBe(false);
    if ("error" in result) return;
    expect(result.attachment.id).toBe("attach-new");
  });

  it("surfaces a cap-refusal error from the data layer (e.g. size or count cap) instead of throwing", async () => {
    vi.mocked(getInstitutionPage).mockResolvedValueOnce(page());
    vi.mocked(createInstitutionPageAttachment).mockRejectedValueOnce(
      new Error('"huge.zip" is 12 MB, over the 6 MB per-file limit.')
    );

    const result = await uploadInstitutionPageAttachmentAction("page-1", {
      name: "huge.zip",
      base64: Buffer.from("x").toString("base64"),
      mimeType: "application/zip",
    });

    expect(result).toEqual({ error: '"huge.zip" is 12 MB, over the 6 MB per-file limit.' });
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
