// Opt-in native IndexedDB check. Run from the repo root with an installed Chrome:
// node src/tools/repo-feedback-idb-native.mjs "C:\Program Files\Google\Chrome\Application\chrome.exe"
// Serves only loopback and creates a fresh, temporary browser profile.
import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, realpathSync, rmSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import ts from "typescript";
import { verifyAdapter } from "./repo-feedback-idb-native.fixture.mjs";

const chromePath = process.argv[2];
if (!chromePath) throw new Error("Pass the path to an installed Chrome executable.");

const sourceDir = new URL("../app/components/repo-grades/", import.meta.url);
const modules = ["repoFeedbackIdb", "repoFeedbackIdbAdapter"].map((name) => {
  const source = readFileSync(new URL(name + ".ts", sourceDir), "utf8");
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  });
  const key = JSON.stringify("./" + name);
  return `modules[${key}] = {}; ((exports, require) => {
${outputText}
})(modules[${key}], name => modules[name]);`;
}).join("\n");

const script = `
const modules = Object.create(null);
${modules}
${verifyAdapter.toString()}
verifyAdapter(modules).then(
  message => { document.querySelector("#result").textContent = message; },
  error => { document.querySelector("#result").textContent = "FAIL " + error.name + " " + error.message; },
).finally(() => fetch("/done"));
`;
const html = `<!doctype html><pre id="result">pending</pre><img src="/hold" alt="">
<script>${script.replace(/<\/script/gi, "<\\/script")}</script>`;

let heldResponse;
let completed = false;
const server = createServer((request, response) => {
  if (request.url === "/") {
    response.setHeader("content-type", "text/html; charset=utf-8");
    response.setHeader("content-security-policy", "default-src 'none'; script-src 'unsafe-inline'; img-src 'self'; connect-src 'self'");
    response.end(html);
  } else if (request.url === "/done") {
    completed = true;
    heldResponse?.end();
    response.end();
  } else if (request.url === "/hold") {
    if (completed) response.end();
    else heldResponse = response;
  } else {
    response.writeHead(404).end();
  }
});

const tempDirectory = realpathSync(tmpdir());
const profile = mkdtempSync(join(tempDirectory, "repo-feedback-idb-native-"));
try {
  await new Promise((ready, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", ready);
  });
  const chrome = spawn(chromePath, [
    "--headless", "--disable-gpu", "--disable-background-networking", "--disable-component-update",
    "--disable-extensions", "--disable-sync", "--no-first-run", "--no-default-browser-check", "--no-proxy-server",
    "--user-data-dir=" + profile, "--dump-dom", "http://127.0.0.1:" + server.address().port + "/",
  ], { windowsHide: true, stdio: ["ignore", "pipe", "ignore"] });
  let dom = "";
  chrome.stdout.setEncoding("utf8").on("data", (chunk) => { dom += chunk; });
  const timeout = setTimeout(() => {
    console.error("Native IndexedDB test timed out.");
    chrome.kill();
  }, 15000);
  try {
    const code = await new Promise((finish, reject) => {
      chrome.once("error", reject);
      chrome.once("close", finish);
    });
    const result = /<pre id="result">([^<]*)<\/pre>/.exec(dom)?.[1] ?? "No result from Chrome";
    console.log(result);
    process.exitCode = code === 0 && result.startsWith("PASS_NATIVE_INDEXEDDB ") ? 0 : 1;
  } finally {
    clearTimeout(timeout);
  }
} finally {
  heldResponse?.end();
  server.closeAllConnections();
  server.close();
  // Remove only the isolated profile created under the resolved temp directory.
  const absoluteProfile = realpathSync(profile);
  if (dirname(absoluteProfile) === resolve(tempDirectory)) {
    rmSync(absoluteProfile, { recursive: true, maxRetries: 5 });
  }
}
