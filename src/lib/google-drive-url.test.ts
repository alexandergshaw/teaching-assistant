import { describe, it, expect } from "vitest";
import {
  parseGoogleDriveUrl,
  buildDriveDownloadUrl,
  buildDriveDocExportUrl,
  DRIVE_ID,
  type GoogleDriveTarget,
} from "./google-drive-url";

// Frozen input -> expected oracle. The axes (URL shapes) come from the scope's
// shape catalogue, not from the implementation.
const ID = "1AbC_dEf-GhIjKlMnOpQrStUvWxYz0123456789";

const TABLE: ReadonlyArray<readonly [string, string, GoogleDriveTarget | null]> = [
  ["file view", `https://drive.google.com/file/d/${ID}/view?usp=sharing`, { kind: "file", id: ID }],
  ["file view, user path", `https://drive.google.com/file/u/0/d/${ID}/view`, { kind: "file", id: ID }],
  ["open?id", `https://drive.google.com/open?id=${ID}`, { kind: "file", id: ID }],
  ["uc export=download", `https://drive.google.com/uc?export=download&id=${ID}`, { kind: "file", id: ID }],
  ["uc?id", `https://drive.google.com/uc?id=${ID}`, { kind: "file", id: ID }],
  [
    "usercontent download",
    `https://drive.usercontent.google.com/download?id=${ID}&export=download&confirm=t`,
    { kind: "file", id: ID },
  ],
  ["scheme-less paste", `drive.google.com/file/d/${ID}/view`, { kind: "file", id: ID }],
  ["http scheme", `http://drive.google.com/file/d/${ID}/view`, { kind: "file", id: ID }],
  ["www prefix and upper-case host", `https://WWW.Drive.Google.com/file/d/${ID}/view`, { kind: "file", id: ID }],
  ["surrounding whitespace", `  https://drive.google.com/open?id=${ID}  `, { kind: "file", id: ID }],
  ["document", `https://docs.google.com/document/d/${ID}/edit`, { kind: "native-doc", docType: "document", id: ID }],
  [
    "document, user path",
    `https://docs.google.com/document/u/0/d/${ID}/edit`,
    { kind: "native-doc", docType: "document", id: ID },
  ],
  [
    "spreadsheet",
    `https://docs.google.com/spreadsheets/d/${ID}/edit#gid=0`,
    { kind: "native-doc", docType: "spreadsheet", id: ID },
  ],
  [
    "presentation",
    `https://docs.google.com/presentation/d/${ID}/edit`,
    { kind: "native-doc", docType: "presentation", id: ID },
  ],
  ["folder", `https://drive.google.com/drive/folders/${ID}`, { kind: "folder", id: ID }],
  ["folder, user path", `https://drive.google.com/drive/u/0/folders/${ID}?usp=sharing`, { kind: "folder", id: ID }],
  // Adversarial and negative rows.
  ["exact-host trap (suffix)", `https://drive.google.com.evil.com/file/d/${ID}/view`, null],
  ["exact-host trap (prefix)", `https://evil-drive.google.com/file/d/${ID}/view`, null],
  ["userinfo trap", `https://drive.google.com@evil.com/file/d/${ID}/view`, null],
  ["non-Drive host", `https://example.com/file/d/${ID}/view`, null],
  ["github repo", "https://github.com/octocat/hello-world", null],
  ["canvas assignment", "https://canvas.example.edu/courses/12/assignments/34", null],
  ["id with encoded slash", "https://drive.google.com/file/d/ab%2Fcd/view", null],
  ["id with dot (query)", "https://drive.google.com/open?id=ab.cd", null],
  ["id with slash (query)", "https://drive.google.com/open?id=ab/cd", null],
  ["open without id", "https://drive.google.com/open", null],
  ["file without id", "https://drive.google.com/file/d/", null],
  ["folder without id", "https://drive.google.com/drive/folders/", null],
  ["docs unknown product", `https://docs.google.com/forms/d/${ID}/edit`, null],
  ["drive root", "https://drive.google.com/", null],
  ["empty", "", null],
  ["garbage", "not a url at all ::", null],
];

describe("parseGoogleDriveUrl oracle", () => {
  for (const [label, input, expected] of TABLE) {
    it(label, () => {
      expect(parseGoogleDriveUrl(input)).toEqual(expected);
    });
  }

  it("stops at the id boundary when extra path segments follow", () => {
    expect(parseGoogleDriveUrl(`https://drive.google.com/file/d/${ID}/view/extra`)).toEqual({
      kind: "file",
      id: ID,
    });
  });
});

describe("DRIVE_ID", () => {
  it("accepts url-safe ids and rejects delimiters", () => {
    expect(DRIVE_ID.test(ID)).toBe(true);
    for (const bad of ["", "a/b", "a.b", "a:b", "a?b", "a#b", "a@b", "a b", "a\\b"]) {
      expect(DRIVE_ID.test(bad)).toBe(false);
    }
  });
});

describe("URL builders", () => {
  it("builds host-fixed URLs from a valid id", () => {
    expect(buildDriveDownloadUrl(ID)).toBe(`https://drive.google.com/uc?export=download&id=${ID}`);
    expect(buildDriveDocExportUrl(ID, "txt")).toBe(`https://docs.google.com/document/d/${ID}/export?format=txt`);
    expect(new URL(buildDriveDownloadUrl(ID)).hostname).toBe("drive.google.com");
    expect(new URL(buildDriveDocExportUrl(ID, "txt")).hostname).toBe("docs.google.com");
  });

  it("refuses an id that could smuggle a host or path", () => {
    for (const bad of ["evil.com/x", "a@evil.com", "a/../b", "a?x=1", "", "a#b"]) {
      expect(() => buildDriveDownloadUrl(bad)).toThrow();
      expect(() => buildDriveDocExportUrl(bad, "txt")).toThrow();
    }
  });
});
