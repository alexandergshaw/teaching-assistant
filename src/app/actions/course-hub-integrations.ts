"use server";

import { getCourseNotifications } from "@/lib/canvas";
import { CANVAS_INSTITUTIONS } from "@/lib/canvas-core";
import { createServiceClient } from "@/lib/supabase/server";
import { requireOwner } from "@/lib/supabase/auth";
import { listLmsCredentials } from "@/lib/lms-credentials";
import { getCredentials, deleteCredentials } from "@/lib/google-credentials";
import { loadInstitutionFields, saveInstitutionFields, listAllInstitutionFields, type InstitutionField } from "@/lib/institution-fields";

// ── Google Calendar scheduling ──────────────────────────────────────────────

/** Whether the owner has connected Google Calendar (and can read free/busy). */
export async function getGoogleCalendarStatusAction(): Promise<
  { connected: boolean } | { error: string }
> {
  try {
    const user = await requireOwner();
    const creds = await getCredentials(user.id);
    return { connected: !!creds && !!creds.refreshToken };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not check the connection." };
  }
}

/** Forget the owner's Google connection. */
export async function disconnectGoogleCalendarAction(): Promise<
  { ok: true } | { error: string }
> {
  try {
    const user = await requireOwner();
    await deleteCredentials(user.id);
    return { ok: true };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not disconnect Google Calendar." };
  }
}

// ── Closed-LMS integration suite (CHUNK E) ──────────────────────────────────

/** E1: Fetch an ICS feed from a URL (calendar export). */
export async function fetchIcsFeedAction(url: string): Promise<{ ics: string } | { error: string }> {
  try {
    await requireOwner();

    const parsedUrl = new URL(url);
    if (!parsedUrl.protocol.match(/^https?:$/)) {
      return { error: "Calendar feed URL must be http or https." };
    }

    const response = await fetch(url, {
      headers: { "User-Agent": "teaching-assistant/1.0" },
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      return { error: `Failed to fetch calendar feed: HTTP ${response.status}` };
    }

    const text = await response.text();

    if (text.length > 2_000_000) {
      return { error: "The feed is too large." };
    }

    return { ics: text };
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Could not fetch the calendar feed.",
    };
  }
}

/** E2: Save institution field definitions (e.g. calendar feed URLs). */
export async function saveInstitutionFieldsAction(
  acronym: string,
  fields: InstitutionField[]
): Promise<{ ok: true } | { error: string }> {
  try {
    const user = await requireOwner();
    const supabase = createServiceClient();
    await saveInstitutionFields(supabase, user.id, acronym, fields);
    return { ok: true };
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Could not save institution fields.",
    };
  }
}

/** E3: List institutions that have calendar feeds configured. */
export async function listInstitutionsWithFeedsAction(): Promise<
  { institutions: Array<{ acronym: string; feedUrls: string[] }> } | { error: string }
> {
  try {
    const user = await requireOwner();
    const supabase = createServiceClient();
    const allInstitutions = await listAllInstitutionFields(supabase, user.id);

    const institutions = allInstitutions
      .map(({ acronym, fields }) => {
        const feedUrls = fields
          .filter((f) => f.id.startsWith("calendarFeedUrl") && f.value.trim())
          .sort((a, b) => a.id.localeCompare(b.id))
          .map((f) => f.value.trim());

        return { acronym, feedUrls };
      })
      .filter((i) => i.feedUrls.length > 0);

    return { institutions };
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Could not list institutions with feeds.",
    };
  }
}

/** E4: Get calendar feed URLs for one institution. */
export async function listInstitutionFeedUrlsAction(acronym: string): Promise<
  { feedUrls: string[] } | { error: string }
> {
  try {
    const user = await requireOwner();
    const supabase = createServiceClient();
    const fields = await loadInstitutionFields(supabase, user.id, acronym);

    const feedUrls = fields
      .filter((f) => f.id.startsWith("calendarFeedUrl") && f.value.trim())
      .sort((a, b) => a.id.localeCompare(b.id))
      .map((f) => f.value.trim());

    return { feedUrls };
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Could not list institution feed URLs.",
    };
  }
}

// ── Live Feed (Grading) ─────────────────────────────────────────────────────

/**
 * Report, per institution acronym, whether its Canvas and grading-service env
 * vars are configured — so the Live Feed table can flag missing setup without
 * exposing any secret values.
 *
 * DAT2 (docs/lms-credentials-acceptance-criteria.md) - requireOwner() is a
 * deprecated alias for requireUser() ("any active account" - see auth.ts's
 * own comment on it), so this action is already reachable by every signed-in
 * member, not only the owner. Before Group E's per-user credentials, an
 * unconditional env read here made this a probe oracle: any member could
 * submit acronyms and read the owner's environment back one bit at a time.
 * Fixed in the BODY, not the guard - swapping requireOwner() for
 * getEffectiveIdentity() to "simplify" this would stop enforcing BLOCK2 for
 * this action specifically (see effective-identity.ts's own header), which
 * is a bigger, separately-reviewed change this wave does not make (E-ARCH8).
 * Only an identity whose role is LITERALLY "owner" ever sees the env-derived
 * status; everyone else sees only whether THEY have their own stored Canvas
 * credential for that institution (src/lib/lms-credentials.ts).
 */
export async function checkInstitutionsAction(
  acronyms: string[]
): Promise<
  | { statuses: Array<{ acronym: string; canvasConfigured: boolean; llmConfigured: boolean }> }
  | { error: string }
> {
  try {
    const identity = await requireOwner();
    const isOwner = identity.role === "owner";
    const ownInstitutions = new Set(
      (await listLmsCredentials(identity.id)).map((cred) => cred.institution)
    );
    const statuses = acronyms.map((raw) => {
      const code = raw.trim().toUpperCase();
      const envCanvasConfigured =
        isOwner && !!process.env[`${code}_CANVAS_URL`] && !!process.env[`${code}_CANVAS_API_TOKEN`];
      return {
        acronym: code,
        canvasConfigured: ownInstitutions.has(code) || envCanvasConfigured,
        llmConfigured: isOwner && !!process.env[`${code}_LLM_URL`] && !!process.env[`${code}_LLM_API`],
      };
    });
    return { statuses };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not check institutions." };
  }
}

/**
 * Every institution the calling identity actually has Canvas access to. This
 * is what "all institutions" options resolve to for unattended runs and
 * event triggers (8 non-test consumers - docs/REGRESSION.md entry 402h).
 *
 * DAT2's repoint, replacing the unconditional `<ACRONYM>_CANVAS_URL` /
 * `<ACRONYM>_CANVAS_API_TOKEN` env scan every signed-in member used to be
 * able to trigger (see checkInstitutionsAction's comment above for why
 * requireOwner() alone does not gate this): an identity whose role is
 * literally "owner" sees the union of env-configured acronyms - including
 * any hardcoded institution (CANVAS_INSTITUTIONS in canvas-core.ts) that
 * derives its host and so works with just a token env var, which is why this
 * is the one place outside canvas-credentials.ts still allowed to read a
 * `<CODE>_CANVAS_*` env var by name - AND their own stored rows; everyone
 * else sees ONLY their own stored rows (src/lib/lms-credentials.ts). A member
 * with no stored credential yet gets an empty list rather than the owner's
 * configured institutions.
 */
export async function listConfiguredInstitutionsAction(): Promise<
  { acronyms: string[] } | { error: string }
> {
  try {
    const identity = await requireOwner();
    const acronyms = new Set<string>();
    if (identity.role === "owner") {
      for (const key of Object.keys(process.env)) {
        const m = /^([A-Z][A-Z0-9]*)_CANVAS_URL$/.exec(key);
        if (!m) continue;
        const code = m[1];
        if (process.env[key] && process.env[`${code}_CANVAS_API_TOKEN`]) {
          acronyms.add(code);
        }
      }
      // Hardcoded institutions derive their host and so work with only a
      // token set (no `<CODE>_CANVAS_URL`); env-name scanning alone would
      // miss them, making "all institutions" narrower than what actually
      // works for the owner.
      for (const inst of CANVAS_INSTITUTIONS) {
        if (process.env[`${inst.code}_CANVAS_API_TOKEN`]) {
          acronyms.add(inst.code.toUpperCase());
        }
      }
    }
    for (const cred of await listLmsCredentials(identity.id)) {
      acronyms.add(cred.institution);
    }
    return { acronyms: [...acronyms].sort() };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not list institutions." };
  }
}

/** Per-course LMS notification counts (needs-grading + unread inbox) for its tile. */
export async function getCourseNotificationsAction(
  canvasUrl: string,
  institution?: string
): Promise<{ needsGrading: number; unread: number } | { error: string }> {
  try {
    await requireOwner();
    const match = canvasUrl.match(/\/courses\/(\d+)/);
    if (!match) return { error: "Course URL must look like .../courses/123." };
    const code = institution?.trim();
    if (!code) return { error: "Set this course's institution to load notifications." };
    return await getCourseNotifications(code, match[1]);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not load notifications." };
  }
}

/** Export a course as an IMS Common Cartridge from the LMS. */
export async function exportCourseCartridgeAction(
  courseUrl: string,
  acronym?: string
): Promise<{ fileName: string; base64: string } | { error: string }> {
  try {
    const { exportCourseCartridge } = await import("@/lib/canvas");
    await requireOwner();
    return await exportCourseCartridge(courseUrl, acronym?.trim());
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not export the course from the LMS." };
  }
}
