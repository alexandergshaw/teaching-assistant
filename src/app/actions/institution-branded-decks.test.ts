import { beforeEach, describe, expect, it, vi } from "vitest";
import JSZip from "jszip";
import { BRANDED_DECK_MIME, INSTITUTION_BRANDED_DECKS_BUCKET, MAX_INSTITUTION_DECK_BYTES } from "@/lib/institution-branded-decks";
import { getAppUser } from "@/lib/supabase/app-users";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { getInstitutionDeckRow, institutionExists, listInstitutionDeckRows } from "@/lib/institution-branded-decks-storage";
import { downloadInstitutionDeckAction, finishInstitutionDeckUploadAction, listInstitutionBrandedDecksAction, startInstitutionDeckUploadAction } from "./institution-branded-decks";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn(), createServiceClient: vi.fn() }));
vi.mock("@/lib/supabase/app-users", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/supabase/app-users")>(),
  getAppUser: vi.fn(),
}));
vi.mock("@/lib/institution-branded-decks-storage", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/institution-branded-decks-storage")>(),
  getInstitutionDeckRow: vi.fn(),
  institutionExists: vi.fn(),
  listInstitutionDeckRows: vi.fn(),
}));

const owner = "user-a";
const email = "instructor@example.edu";
const id = "9dc93abf-b9ae-4fd8-9903-dea985cbabec";
const acronym = "WNCC";
const row = { user_id: owner, acronym, id, file_name: "Campus.potx", extension: "potx" as const, size_bytes: 100, created_at: "" };
const staging = `staging/${owner}/${acronym}/${id}.potx`;
const published = `files/${owner}/${acronym}/${id}.potx`;
const bucket = {
  createSignedUploadUrl: vi.fn(),
  createSignedUrl: vi.fn(),
  download: vi.fn(),
  upload: vi.fn(),
  remove: vi.fn(),
};
const single = vi.fn();
const insert = vi.fn(() => ({ select: vi.fn(() => ({ single })) }));
const client = { storage: { from: vi.fn(() => bucket) }, from: vi.fn(() => ({ insert })) };
const session = {
  auth: {
    getUser: vi.fn(),
    mfa: { getAuthenticatorAssuranceLevel: vi.fn() },
  },
};

async function officeFile(kind: "presentation" | "template", macro = false) {
  const zip = new JSZip();
  zip.file("[Content_Types].xml", `<Types><Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.${kind}.main+xml"/></Types>`);
  zip.file("ppt/presentation.xml", "<p:presentation/>");
  if (macro) zip.file("ppt/vbaProject.bin", "embedded macros");
  const data = await zip.generateAsync({ type: "arraybuffer" });
  return new Blob([data]);
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(createClient).mockResolvedValue(session as never);
  session.auth.getUser.mockResolvedValue({ data: { user: { id: owner, email } }, error: null });
  session.auth.mfa.getAuthenticatorAssuranceLevel.mockResolvedValue({ data: { currentLevel: "aal1", nextLevel: "aal1" }, error: null });
  vi.mocked(getAppUser).mockResolvedValue({
    id: owner, email, displayName: "Instructor", role: "instructor", status: "active",
    approvedAt: null, approvedBy: null, createdAt: "", updatedAt: "", statusChangedAt: null,
    statusChangedBy: null, roleGrantedBy: null,
  });
  vi.mocked(createServiceClient).mockReturnValue(client as never);
  vi.mocked(institutionExists).mockResolvedValue(true);
  vi.mocked(getInstitutionDeckRow).mockResolvedValue(null);
  vi.mocked(listInstitutionDeckRows).mockResolvedValue([row]);
  bucket.createSignedUploadUrl.mockResolvedValue({ data: { token: "upload-token" }, error: null });
  bucket.createSignedUrl.mockResolvedValue({ data: { signedUrl: "https://example.invalid/download" }, error: null });
  bucket.upload.mockResolvedValue({ data: {}, error: null });
  bucket.remove.mockResolvedValue({ data: [], error: null });
  single.mockResolvedValue({ data: row, error: null });
});

describe("institution slide deck file actions", () => {
  it("rejects unsigned or switched accounts before reaching service-role storage", async () => {
    session.auth.getUser.mockResolvedValueOnce({ data: { user: null }, error: null });
    expect(await listInstitutionBrandedDecksAction(owner)).toHaveProperty("error");
    expect(await listInstitutionBrandedDecksAction("someone-else")).toHaveProperty("error");
    expect(await startInstitutionDeckUploadAction("someone-else", acronym, row.file_name, 100)).toHaveProperty("error");
    expect(await finishInstitutionDeckUploadAction("someone-else", acronym, id, row.file_name, 100)).toHaveProperty("error");
    expect(await downloadInstitutionDeckAction("someone-else", acronym, id)).toHaveProperty("error");
    expect(createServiceClient).not.toHaveBeenCalled();
  });

  it("rejects an authenticated account missing an enrolled MFA step-up", async () => {
    session.auth.mfa.getAuthenticatorAssuranceLevel.mockResolvedValueOnce({ data: { currentLevel: "aal1", nextLevel: "aal2" }, error: null });
    expect(await listInstitutionBrandedDecksAction(owner)).toHaveProperty("error");
    expect(createServiceClient).not.toHaveBeenCalled();
  });

  it("scopes listing and signed URLs to the authenticated owner's registered files", async () => {
    expect(await listInstitutionBrandedDecksAction(owner)).toEqual({ files: [{ id, acronym, name: row.file_name, extension: "potx", size: 100 }] });
    expect(listInstitutionDeckRows).toHaveBeenCalledWith(client, owner);
    expect(await downloadInstitutionDeckAction(owner, acronym, "files/someone-else")).toHaveProperty("error");
    expect(await downloadInstitutionDeckAction(owner, acronym, id)).toHaveProperty("error");
    expect(bucket.createSignedUrl).not.toHaveBeenCalled();
    const filename = "École & Lab #1%.potx";
    vi.mocked(getInstitutionDeckRow).mockResolvedValueOnce({ ...row, file_name: filename });
    const result = await downloadInstitutionDeckAction(owner, " wncc ", id);
    expect(result.url && new URL(result.url).searchParams.get("download")).toBe(filename);
    expect(getInstitutionDeckRow).toHaveBeenLastCalledWith(client, owner, acronym, id);
    expect(bucket.createSignedUrl).toHaveBeenCalledWith(published, 300);
  });

  it("rejects unsafe filename, size and institution inputs and signs only fresh staging keys", async () => {
    expect(await startInstitutionDeckUploadAction(owner, "../OTHER", row.file_name, 100)).toHaveProperty("error");
    expect(await startInstitutionDeckUploadAction(owner, acronym, "../Campus.pptx", 100)).toHaveProperty("error");
    expect(await startInstitutionDeckUploadAction(owner, acronym, "Campus.pptx", MAX_INSTITUTION_DECK_BYTES + 1)).toHaveProperty("error");
    expect(await startInstitutionDeckUploadAction(owner, acronym, "Campus.pptm", 100)).toHaveProperty("error");
    vi.mocked(institutionExists).mockResolvedValueOnce(false);
    expect(await startInstitutionDeckUploadAction(owner, acronym, row.file_name, 100)).toHaveProperty("error");
    expect(bucket.createSignedUploadUrl).not.toHaveBeenCalled();
    const result = await startInstitutionDeckUploadAction(owner, " wncc ", "Campus.POTX", 100);
    expect(result).toMatchObject({ id: expect.any(String), token: "upload-token", contentType: BRANDED_DECK_MIME.potx });
    expect(client.storage.from).toHaveBeenCalledWith(INSTITUTION_BRANDED_DECKS_BUCKET);
    expect(institutionExists).toHaveBeenLastCalledWith(client, owner, acronym);
    expect(bucket.createSignedUploadUrl).toHaveBeenCalledWith(expect.stringMatching(/^staging\/user-a\/WNCC\/[0-9a-f-]{36}\.potx$/), { upsert: false });
  });

  it.each(["pptx", "potx"] as const)("publishes unchanged verified %s bytes to a separate immutable key and clears staging", async (extension) => {
    const file = await officeFile(extension === "pptx" ? "presentation" : "template");
    const filename = `Campus.${extension}`;
    single.mockResolvedValueOnce({ data: { ...row, file_name: filename, extension, size_bytes: file.size } });
    bucket.download.mockResolvedValueOnce({ data: file, error: null });
    expect(await finishInstitutionDeckUploadAction(owner, acronym, id, filename, file.size)).toMatchObject({ file: { name: filename, extension } });
    expect(bucket.download).toHaveBeenCalledWith(`staging/${owner}/${acronym}/${id}.${extension}`);
    expect(bucket.upload).toHaveBeenCalledWith(`files/${owner}/${acronym}/${id}.${extension}`, Buffer.from(await file.arrayBuffer()), {
      contentType: BRANDED_DECK_MIME[extension], cacheControl: "0", upsert: false,
    });
    expect(bucket.remove).toHaveBeenCalledWith([`staging/${owner}/${acronym}/${id}.${extension}`]);
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({ id, user_id: owner, acronym, file_name: filename, size_bytes: file.size }));
  });

  it("cleans refused staging files and never publishes size mismatches, disguised PPTX or embedded VBA", async () => {
    const wrongSize = { size: 200, arrayBuffer: vi.fn() };
    bucket.download.mockResolvedValueOnce({ data: wrongSize });
    expect(await finishInstitutionDeckUploadAction(owner, acronym, id, row.file_name, 100)).toHaveProperty("error");
    expect(wrongSize.arrayBuffer).not.toHaveBeenCalled();
    for (const file of [await officeFile("presentation"), await officeFile("template", true)]) {
      bucket.download.mockResolvedValueOnce({ data: file });
      expect(await finishInstitutionDeckUploadAction(owner, acronym, id, row.file_name, file.size)).toHaveProperty("error");
    }
    expect(bucket.remove.mock.calls).toEqual([[[staging]], [[staging]], [[staging]]]);
    expect(bucket.upload).not.toHaveBeenCalled();
    expect(insert).not.toHaveBeenCalled();
  });

  it("rescues a committed registration after a lost response and removes a definitively unregistered copy", async () => {
    const file = await officeFile("template");
    bucket.download.mockResolvedValue({ data: file });
    single.mockRejectedValue(new Error("response lost"));
    vi.mocked(getInstitutionDeckRow).mockResolvedValueOnce(null).mockResolvedValueOnce(row);
    expect(await finishInstitutionDeckUploadAction(owner, acronym, id, row.file_name, file.size)).toHaveProperty("file");
    expect(bucket.remove).not.toHaveBeenCalledWith([published]);
    expect(await finishInstitutionDeckUploadAction(owner, acronym, id, row.file_name, file.size)).toHaveProperty("error");
    expect(bucket.remove).toHaveBeenCalledWith([published]);
  });
});
