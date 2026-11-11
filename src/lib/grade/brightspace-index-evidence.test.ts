import { expect, it } from "vitest";
import { isBrightspaceFormattingOnly, parseBrightspaceIndexEvidence, partitionBrightspaceRows } from "./brightspace-index-evidence";

it("keeps comments in their LMS group and retains the original index", () => {
  const rows = [
    { cellTexts: ["Smith, Ada"], html: "<tr><td>Smith, Ada</td></tr>" },
    { cellTexts: ["10-20 - work Comments: a student's note", "Submitted: Monday"], html: "<tr><td>10-20 - work Comments: a student's note</td><td>Submitted: Monday</td></tr>" },
    { cellTexts: ["Jones, Lee"], html: "<tr><td>Jones, Lee</td></tr>" },
    { cellTexts: ["30-40 - work Comments: another note", "Submitted: Tuesday"], html: "<tr><td>30-40 - work Comments: another note</td><td>Submitted: Tuesday</td></tr>" },
  ];
  const result = partitionBrightspaceRows("original index bytes", rows, { "10-20": "Smith, Ada", "30-40": "Jones, Lee" }, []);
  expect(result.sourceHtml).toBe("original index bytes"); expect(result.unassigned).toEqual([]);
  expect(result.groups["10-20"].join(" ")).toContain("a student's note"); expect(result.groups["10-20"].join(" ")).not.toContain("another note");
  expect(result.groups["30-40"].join(" ")).toContain("another note");
});

it("holds unknown rows, orphan names, and outside text instead of dropping them", () => {
  const result = partitionBrightspaceRows("original", [
    { cellTexts: ["Smith, Ada"], html: "orphan" },
    { cellTexts: ["Jones, Lee"], html: "header" },
    { cellTexts: ["90-91 - unknown", "content"], html: "unknown row" },
  ], { "10-20": "Smith, Ada" }, ["outside content"]);
  expect(result.unassigned).toEqual(["outside content", "orphan", "unknown row", "header"]);
  expect(Object.keys(result.groups)).toEqual([]);
});

it("holds known IDs under a mismatched header", () => {
  const result = partitionBrightspaceRows("original", [{ cellTexts: ["Wrong, Person"], html: "wrong header" }, { cellTexts: ["10-20 - work", "comments"], html: "row with evidence" }], { "10-20": "Smith, Ada" }, []);
  expect(result.groups["10-20"]).toBeUndefined(); expect(result.unassigned).toEqual(["row with evidence", "wrong header"]);
});
it("holds ambiguous duplicate names even when an ID matches", () => {
  const result = partitionBrightspaceRows("original", [{ cellTexts: ["Smith, Ada"], html: "header" }, { cellTexts: ["10-20 - work", "comment"], html: "row" }], { "10-20": "Smith, Ada", "30-40": "Smith, Ada" }, []);
  expect(result.groups["10-20"]).toBeUndefined(); expect(result.unassigned).toEqual(["row", "header"]);
});
it("parses without executing resources and retains original row bytes and outside content", () => {
  const source = '<html><body><script src="https://invalid.example/x.js"></script><!-- outside --><table><tr><td>Smith, Ada</td></tr><tr data-note="attribute evidence"><td>10-20 - work<br>Comments: keep &amp; grade</td><td>Submitted: Monday</td></tr></table><img src="https://invalid.example/pixel"></body></html>';
  const output = parseBrightspaceIndexEvidence(source, { "10-20": "Smith, Ada" });
  expect(output.sourceHtml).toBe(source);
  expect(output.groups["10-20"].join(" ")).toContain('data-note="attribute evidence"');
  expect(output.groups["10-20"].join(" ")).toContain("keep &amp; grade");
  expect(output.unassigned.join("")).toContain('<script src="https://invalid.example/x.js"></script>');
  expect(output.unassigned.join("")).toContain("<!-- outside -->");
  expect(output.unassigned.join("")).toContain('<img src="https://invalid.example/pixel">');
});
it("recognizes only bounded layout markup as non-evidence", () => {
  expect(isBrightspaceFormattingOnly('<html><body bgcolor=white><table width="100%" border=0><tr><td bgcolor=black>')).toBe(true);
  for (const fragment of ['<body title="student text">', '<img src="https://example.com">', '<!-- a comment -->', '<table width="secret">', '<body>hidden text</body>', '<script>x</script>']) expect(isBrightspaceFormattingOnly(fragment)).toBe(false);
});
