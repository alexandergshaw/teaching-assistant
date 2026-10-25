import { describe, expect, it } from "vitest";
import {
  containsInstitutionCredentialProperties,
  normalizeInstitutionAcronym,
  resolveInstitutionLmsAction,
  validateInstitutionDirectoryColumn,
  validateInstitutionDirectoryProfile,
  validateInstitutionDirectoryValue,
} from "./institution-directory";

const profile = (extra: Record<string, unknown> = {}) => ({
  acronym: " wwu ", fullName: "Western Wyoming University", email: "teacher@example.edu",
  emailClient: "outlook", emailClientOtherName: "", emailUrl: "https://outlook.office.com",
  lmsType: "canvas", lmsOtherName: "", lmsUrl: "https://canvas.wwu.edu",
  facultyPortalUrl: "https://faculty.wwu.edu", websiteUrl: "https://www.wwu.edu", department: "IT", ...extra,
});

describe("institution directory validation", () => {
  it("normalizes account-local institution keys and validates the fixed profile shape", () => {
    expect(normalizeInstitutionAcronym(" wwu ")).toBe("WWU");
    expect(validateInstitutionDirectoryProfile(profile())).toMatchObject({ ok: true, value: { acronym: "WWU", email: "teacher@example.edu" } });
    expect(validateInstitutionDirectoryProfile(profile({ acronym: "!!!" }))).toMatchObject({ ok: false, reason: "invalid-acronym" });
    expect(validateInstitutionDirectoryProfile(profile({ email: "not an email" }))).toMatchObject({ ok: false, reason: "invalid-email" });
  });

  it("accepts only safe HTTPS destinations without credentials or query data", () => {
    expect(validateInstitutionDirectoryProfile(profile({ lmsUrl: "http://canvas.wwu.edu" }))).toMatchObject({ ok: false, reason: "invalid-lmsUrl" });
    expect(validateInstitutionDirectoryProfile(profile({ lmsUrl: "https://user:pass@canvas.wwu.edu" }))).toMatchObject({ ok: false, reason: "invalid-lmsUrl" });
    expect(validateInstitutionDirectoryProfile(profile({ lmsUrl: "https://canvas.wwu.edu/login?token=x" }))).toMatchObject({ ok: false, reason: "invalid-lmsUrl" });
  });

  it("rejects structured credential properties and credential-like custom labels", () => {
    expect(validateInstitutionDirectoryProfile(profile({ password: "private" }))).toMatchObject({ ok: false, reason: "invalid-profile" });
    expect(containsInstitutionCredentialProperties({ data: [{ api_key: "private" }] })).toBe(true);
    expect(validateInstitutionDirectoryColumn({ label: "API-Key", type: "text" })).toMatchObject({ ok: false, reason: "credential-label" });
    expect(validateInstitutionDirectoryColumn({ label: "Department", type: "text" })).toMatchObject({ ok: false, reason: "duplicate-label" });
    expect(validateInstitutionDirectoryColumn({ label: "Faculty portal URL", type: "https" })).toMatchObject({ ok: false, reason: "duplicate-label" });
    expect(validateInstitutionDirectoryColumn({ label: "Institution website URL", type: "https" })).toMatchObject({ ok: false, reason: "duplicate-label" });
    expect(validateInstitutionDirectoryColumn({ label: "Time Zone", type: "text" })).toEqual({ ok: true, value: { label: "Time Zone", type: "text" } });
  });

  it("validates date and HTTPS column values and rejects impossible calendar dates", () => {
    expect(validateInstitutionDirectoryValue("date", "2026-02-28")).toEqual({ ok: true, value: "2026-02-28" });
    expect(validateInstitutionDirectoryValue("date", "2026-02-30")).toMatchObject({ ok: false, reason: "invalid-date" });
    expect(validateInstitutionDirectoryValue("https", "https://portal.example.edu")).toMatchObject({ ok: true });
    expect(validateInstitutionDirectoryValue("https", "javascript:alert(1)")).toMatchObject({ ok: false });
  });

  it("opens the exact row's valid LMS and exposes unset or invalid legacy values safely", () => {
    const make = (lmsUrl: string) => ({ profile: profile() as never, commonValues: { email: "", outlookUrl: "", lmsUrl, lmsType: "canvas" }, values: {} });
    expect(resolveInstitutionLmsAction(make("https://one.example.edu"))).toEqual({ kind: "open", href: "https://one.example.edu/" });
    expect(resolveInstitutionLmsAction(make(""))).toEqual({ kind: "not-set" });
    expect(resolveInstitutionLmsAction(make("http://unsafe.example.edu"))).toEqual({ kind: "unavailable" });
  });
});
