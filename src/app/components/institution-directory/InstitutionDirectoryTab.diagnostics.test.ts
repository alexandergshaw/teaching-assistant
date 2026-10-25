import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./InstitutionDirectoryTab.tsx", import.meta.url), "utf8");

describe("institution directory production handler wiring", () => {
  it.each([
    ["saveInstitutionDirectoryProfileAction", "runProfileRequest"],
    ["removeInstitutionDirectoryProfileAction", "runInstitutionDirectoryRemoveProfile"],
    ["saveInstitutionDirectoryColumnAction", "runColumnRequest"],
    ["removeInstitutionDirectoryColumnAction", "runInstitutionDirectoryRemoveColumn"],
    ["saveInstitutionDirectoryValueAction", "runValueRequest"],
  ])("passes %s through its production request handler", (action, handler) => {
    const actionCall = new RegExp(`${handler}\\(\\{[\\s\\S]{0,500}?request:\\s*(?:\\(\\)\\s*=>\\s*)?${action}\\b`);
    expect(source).toMatch(actionCall);
  });

  it("dispatches create/update, create/rename, and save/clear through fixed operation handlers", () => {
    expect(source).toContain('mode === "create" ? runInstitutionDirectoryCreateProfile : runInstitutionDirectoryUpdateProfile');
    expect(source).toContain("id ? runInstitutionDirectoryRenameColumn : runInstitutionDirectoryCreateColumn");
    expect(source).toContain('operation === "save-value" ? runInstitutionDirectorySaveValue : runInstitutionDirectoryClearValue');
  });

  it("delegates closed errors and busy reset to handlers with the real setters", () => {
    expect(source).toContain("directoryLoaderForAccount(account, listInstitutionDirectoryAction)");
    expect(source).toContain("request: () => saveInstitutionDirectoryProfileAction(profile, mode), setError, setBusy");
    expect(source).toContain("request: () => removeInstitutionDirectoryProfileAction(record.profile.acronym), setError, setBusy");
    expect(source).toContain("request: () => removeInstitutionDirectoryColumnAction(id), setError, setBusy");
    expect(source).toMatch(/saveInstitutionDirectoryColumnAction\([\s\S]{0,500}?setError, setBusy/);
    expect(source).toMatch(/saveInstitutionDirectoryValueAction\([\s\S]{0,500}?setError, setBusy/);

  });

  it("refreshes through a separate list handler after fulfilled mutations", () => {
    expect(source).toMatch(/await load\(true\)/);
    expect(source).toContain("await loader?.load(force)");
  });
});
