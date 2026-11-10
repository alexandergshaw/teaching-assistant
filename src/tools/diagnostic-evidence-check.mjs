import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

// Checks the presence of evidence, not its truth or independent review.
export function validateDiagnosticEvidence(evidence) {
  const fields = ["inventory", "lifecycle", "completeness", "privacy", "exportRoundTrip", "ownerIsolation"];
  if (!evidence || typeof evidence !== "object" || Array.isArray(evidence)) return fields;
  return fields.filter((field) => typeof evidence[field] !== "string" || !evidence[field].trim());
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    if (process.argv.length !== 3) throw new Error("Pass one path to a JSON evidence record.");
    const missing = validateDiagnosticEvidence(JSON.parse(readFileSync(process.argv[2], "utf8")));
    if (missing.length) throw new Error(`Missing evidence: ${missing.join(", ")}`);
    console.log("Evidence fields present; independently verify the cited evidence and results.");
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
