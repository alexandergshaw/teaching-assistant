"use server";

import { randomUUID } from "node:crypto";
import { requireUser } from "@/lib/supabase/auth";
import { createServiceClient } from "@/lib/supabase/server";
import { normalizeInstitutionAcronym } from "@/lib/institution-directory";
import { assertInstitutionDeckContainer } from "@/lib/institution-branded-decks-validate";
import { BRANDED_DECK_MIME, INSTITUTION_BRANDED_DECKS_BUCKET, institutionDeckFile } from "@/lib/institution-branded-decks";
import { getInstitutionDeckRow, institutionDeckPath, institutionExists, listInstitutionDeckRows, publicInstitutionDeck } from "@/lib/institution-branded-decks-storage";

const signInError = "Sign in again to use the institution’s slide deck files.";
const unavailable = "That institution or file is no longer available.";
const invalidFile = "Choose a .pptx or .potx file up to 25 MB with a valid file name.";
const badPowerPoint = "This is not a valid, non-macro PowerPoint file of the selected type.";
const uploadError = "Could not upload the slide deck. Try again.";

function acronymFor(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const acronym = normalizeInstitutionAcronym(input);
  return /^[A-Z0-9][A-Z0-9_-]{0,19}$/.test(acronym) ? acronym : null;
}

function validId(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(value);
}

export async function listInstitutionBrandedDecksAction(expectedAccount: unknown) {
  const user = await requireUser().catch(() => null);
  if (!user || user.id !== expectedAccount) return { error: signInError };
  const owner = user.id;
  try {
    const rows = await listInstitutionDeckRows(createServiceClient(), owner);
    return { files: rows.map(publicInstitutionDeck) };
  } catch {
    return { error: "Could not load institution slide decks. Try again." };
  }
}

export async function startInstitutionDeckUploadAction(expectedAccount: unknown, rawAcronym: unknown, name: unknown, size: unknown) {
  const user = await requireUser().catch(() => null);
  if (!user || user.id !== expectedAccount) return { error: signInError };
  const owner = user.id;
  const acronym = acronymFor(rawAcronym);
  const file = institutionDeckFile(name, size);
  if (!acronym) return { error: unavailable };
  if (!file) return { error: invalidFile };
  try {
    const client = createServiceClient();
    if (!await institutionExists(client, owner, acronym)) return { error: unavailable };
    const id = randomUUID();
    const path = institutionDeckPath("staging", owner, acronym, id, file.extension);
    const { data, error } = await client.storage.from(INSTITUTION_BRANDED_DECKS_BUCKET).createSignedUploadUrl(path, { upsert: false });
    return error || !data ? { error: uploadError } : { id, path, token: data.token, contentType: BRANDED_DECK_MIME[file.extension] };
  } catch {
    return { error: uploadError };
  }
}

export async function finishInstitutionDeckUploadAction(expectedAccount: unknown, rawAcronym: unknown, id: unknown, name: unknown, size: unknown) {
  const user = await requireUser().catch(() => null);
  if (!user || user.id !== expectedAccount) return { error: signInError };
  const owner = user.id;
  const acronym = acronymFor(rawAcronym);
  const file = institutionDeckFile(name, size);
  if (!acronym || !validId(id)) return { error: unavailable };
  if (!file) return { error: invalidFile };

  try {
    const client = createServiceClient();
    const existing = await getInstitutionDeckRow(client, owner, acronym, id);
    if (existing) return { file: publicInstitutionDeck(existing) };
    if (!await institutionExists(client, owner, acronym)) return { error: unavailable };
    const bucket = client.storage.from(INSTITUTION_BRANDED_DECKS_BUCKET);
    const staging = institutionDeckPath("staging", owner, acronym, id, file.extension);
    const published = institutionDeckPath("files", owner, acronym, id, file.extension);
    try {
      const { data, error } = await bucket.download(staging);
      if (error || !data) return { error: uploadError };
      if (data.size !== file.size) return { error: badPowerPoint };
      const buffer = Buffer.from(await data.arrayBuffer());
      try { await assertInstitutionDeckContainer(buffer, file.extension); } catch { return { error: badPowerPoint }; }

      // Only the bytes that passed validation can reach the published key.
      const uploaded = await bucket.upload(published, buffer, { contentType: BRANDED_DECK_MIME[file.extension], upsert: false, cacheControl: "0" });
      if (uploaded.error) {
        // Another finalization of this same staging upload may have completed first.
        const registered = await getInstitutionDeckRow(client, owner, acronym, id);
        return registered ? { file: publicInstitutionDeck(registered) } : { error: uploadError };
      }
      const row = { id, user_id: owner, acronym, file_name: file.name, extension: file.extension, size_bytes: file.size };
      const registration = await Promise.resolve(client.from("institution_directory_decks").insert(row).select("*").single()).catch(() => null);
      let stored = registration?.data;
      if (!stored) {
        // A response may be lost after the insert commits. If the lookup also
        // fails, retain the private blob so we cannot break a committed row.
        stored = await getInstitutionDeckRow(client, owner, acronym, id);
      }
      if (!stored) {
        await bucket.remove([published]).catch(() => undefined);
        return { error: uploadError };
      }
      return { file: publicInstitutionDeck(stored) };
    } finally {
      await bucket.remove([staging]).catch(() => undefined);
    }
  } catch {
    return { error: uploadError };
  }
}

export async function downloadInstitutionDeckAction(expectedAccount: unknown, rawAcronym: unknown, id: unknown) {
  const user = await requireUser().catch(() => null);
  if (!user || user.id !== expectedAccount) return { error: signInError };
  const owner = user.id;
  const acronym = acronymFor(rawAcronym);
  if (!acronym || !validId(id)) return { error: unavailable };
  try {
    const client = createServiceClient();
    const file = await getInstitutionDeckRow(client, owner, acronym, id);
    if (!file) return { error: unavailable };
    const path = institutionDeckPath("files", owner, acronym, id, file.extension);
    const { data, error } = await client.storage.from(INSTITUTION_BRANDED_DECKS_BUCKET).createSignedUrl(path, 300);
    if (error || !data) return { error: "Could not open that slide deck. Try again." };
    const url = new URL(data.signedUrl);
    url.searchParams.set("download", file.file_name);
    return { url: url.toString() };
  } catch {
    return { error: "Could not open that slide deck. Try again." };
  }
}
