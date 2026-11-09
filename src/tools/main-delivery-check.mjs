import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const git = (args) => execFileSync("git", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, GIT_NO_REPLACE_OBJECTS: "1" } });

/** Verifies commit ancestry, not deployment or equivalent cherry-picks. */
export function checkMainDelivery(candidate, run = git, read = readFileSync) {
  if (!/^[0-9a-f]{40}$/i.test(candidate ?? "")) throw new Error("Provide the full 40-character candidate commit ID.");
  if (process.env.GIT_GRAFT_FILE !== undefined) throw new Error("GIT_GRAFT_FILE overrides Git ancestry; unset it and retry.");
  let graftPath;
  try { graftPath = run(["rev-parse", "--git-path", "info/grafts"]).trim(); }
  catch { throw new Error("Cannot locate Git grafts; delivery is unverified."); }
  try { if (read(graftPath, "utf8").trim()) throw new Error("Nonempty Git grafts alter ancestry; remove them and retry."); }
  catch (error) { if (error.code !== "ENOENT") throw error; }
  let resolved;
  try { resolved = run(["rev-parse", "--verify", `${candidate}^{commit}`]).trim(); }
  catch { throw new Error("Candidate commit is unavailable locally; fetch it and retry."); }
  if (resolved !== candidate.toLowerCase()) throw new Error("Candidate must identify a commit directly.");
  const live = () => {
    let output;
    try { output = run(["ls-remote", "--exit-code", "origin", "refs/heads/main"]).trim(); }
    catch { throw new Error("Cannot verify live origin/main; check network and retry."); }
    const match = /^([0-9a-f]{40})\s+refs\/heads\/main$/i.exec(output);
    if (!match) throw new Error("Unexpected live origin/main response; retry.");
    return match[1].toLowerCase();
  };
  const remote = live();
  try { run(["cat-file", "-e", `${remote}^{commit}`]); }
  catch { throw new Error("Live origin/main commit is unavailable locally; fetch origin main and retry."); }
  let ancestor = true;
  try { run(["merge-base", "--is-ancestor", candidate, remote]); }
  catch { ancestor = false; }
  if (live() !== remote) throw new Error("origin/main moved during verification; retry.");
  if (!ancestor) throw new Error("pending-main: candidate is not an ancestor of live origin/main. Integrate the reviewed commit and retry. Cherry-picks require separate equivalence proof.");
  return { candidate, remote };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    if (process.argv.length !== 3) throw new Error("Usage: npm run delivery:check -- <full-candidate-commit>");
    const result = checkMainDelivery(process.argv[2]);
    process.stdout.write(`Verified ${result.candidate} is an ancestor of live origin/main ${result.remote}. Deployment and review are separate checks.\n`);
  } catch (error) { process.stderr.write(`${error.message}\n`); process.exitCode = 1; }
}
