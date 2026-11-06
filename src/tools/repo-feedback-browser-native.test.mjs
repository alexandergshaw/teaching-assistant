// Opt-in native browser check. From the repo root, use an installed Chrome:
// node src/tools/repo-feedback-browser-native.test.mjs "C:\Program Files\Google\Chrome\Application\chrome.exe"
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, realpathSync, rmSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { rolldown } from "rolldown";
import ts from "typescript";

const chromePath = process.argv[2];
if (!chromePath) throw new Error("Pass the path to an installed Chrome executable.");

const endpoint = "/auth/repo-feedback-session";
const readinessEndpoint = "/auth/repo-feedback-readiness";
const page = "/fixture?source=synthetic-private-url-marker";
const accountId = "11111111-1111-1111-1111-111111111111";
const sessionId = "33333333-3333-3333-3333-333333333333";
function jwt(id) {
  const claims = Buffer.from(JSON.stringify({
    sub: accountId, session_id: id, exp: Math.floor(Date.now() / 1000) + 120, aal: "aal1",
  })).toString("base64url");
  return `header.${claims}.signature`;
}
const sharedToken = jwt("22222222-2222-2222-2222-222222222222");
const privateToken = jwt(sessionId);

// Run the actual POST handler, with a synthetic upstream verifier. The browser
// exercises real HTTP, but the test can neither call Supabase nor use live auth.
function loadSource(path, resolveImport) {
  const source = readFileSync(new URL(path, import.meta.url), "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText;
  const exports = {};
  new Function("exports", "require", compiled)(exports, resolveImport);
  return exports;
}

const requestHelpers = loadSource("../lib/supabase/repo-feedback-request.ts", (specifier) => {
  assert.equal(specifier, "server-only");
  return {};
});
const contract = loadSource("../lib/repo-feedback-readiness-contract.ts");
let verified = 0;
const sessionRoute = loadSource("../app/auth/repo-feedback-session/route.ts", (specifier) => {
  if (specifier === "@/lib/supabase/repo-feedback-request") return requestHelpers;
  assert.equal(specifier, "@/lib/supabase/repo-feedback-session");
  return { verifyRepoFeedbackSession(token) {
    if (token !== privateToken) return null;
    verified++;
    return { accountId, sessionId };
  } };
});
const readinessRoute = loadSource("../app/auth/repo-feedback-readiness/route.ts", (specifier) => {
  if (specifier === "@/lib/supabase/repo-feedback-request") return requestHelpers;
  if (specifier === "@/lib/repo-feedback-readiness-contract") return contract;
  assert.equal(specifier, "@/lib/supabase/repo-feedback-readiness");
  return { readRepoFeedbackReadiness: () => ({
    origin: "https://feedback-native.example.test",
    policy: contract.REPO_FEEDBACK_READINESS_POLICY,
    expiresAt: Date.now() + 60_000,
  }) };
});

const bundle = await rolldown({
  input: fileURLToPath(new URL("./repo-feedback-browser-native.test.fixture.mjs", import.meta.url)),
  platform: "browser",
  transform: { define: {
    "process.env.NODE_ENV": '"production"',
    "process.env.NEXT_PUBLIC_SUPABASE_URL": '"https://feedback-native.example.test"',
    "process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY": '"sb_publishable_native_fixture"',
  } },
});
let script;
try {
  const { output } = await bundle.generate({ format: "iife" });
  assert.equal(output.length, 1);
  assert.equal(output[0].type, "chunk");
  script = output[0].code;
} finally {
  await bundle.close();
}

let foreignRequests = 0;
const foreign = createServer((request, response) => {
  foreignRequests++;
  response.writeHead(204, { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization" }).end();
});
let origin;
let foreignOrigin;
let hold;
let done = false;
let serverFailed = false;
const observations = [];
const statuses = [];
const readinessStatuses = [];
const server = createServer(async (request, response) => {
  try {
    if (request.url === page) {
      response.writeHead(200, {
        "Content-Type": "text/html; charset=utf-8",
        "Referrer-Policy": "no-referrer",
        "Set-Cookie": "native_feedback_fixture=1; SameSite=Strict; Path=/",
        "Content-Security-Policy": `default-src 'none'; script-src 'self' 'unsafe-inline'; img-src 'self'; connect-src 'self' ${foreignOrigin}`,
      });
      response.end('<!doctype html><pre id="result">pending</pre><img src="/hold" alt="">' +
        `<script>globalThis.repoFeedbackNative = ${JSON.stringify({ accountId, sharedToken, privateToken, foreignOrigin })};</script>` +
        '<script src="/fixture.js"></script>');
    } else if (request.url === "/fixture.js") {
      response.writeHead(200, { "Content-Type": "text/javascript; charset=utf-8" }).end(script);
    } else if (request.url === "/hold") {
      if (done) response.end();
      else hold = response;
    } else if (request.url === "/done") {
      done = true;
      hold?.end();
      response.end();
    } else if (request.url === endpoint || request.url === readinessEndpoint) {
      const chunks = [];
      for await (const chunk of request) chunks.push(chunk);
      const body = Buffer.concat(chunks);
      const headers = new Headers(request.headers);
      const input = new Request(origin + request.url, {
        method: request.method,
        headers,
        body: body.length ? body : undefined,
      });
      if (request.url === readinessEndpoint) {
        assert.equal(headers.has("cookie") || headers.has("authorization") || headers.has("referer"), false);
        const result = await readinessRoute.POST(input);
        readinessStatuses.push(result.status);
        response.writeHead(result.status, Object.fromEntries(result.headers)).end(await result.text());
        return;
      }
      observations.push({
        post: request.method === "POST",
        exactOrigin: headers.get("origin") === origin,
        sameOrigin: headers.get("sec-fetch-site") === "same-origin",
        sameOriginMode: headers.get("sec-fetch-mode") === "same-origin",
        exactBearer: headers.get("authorization") === `Bearer ${privateToken}`,
        noReferrer: !headers.has("referer"),
        noCookie: !headers.has("cookie"),
        noBody: body.length === 0,
      });
      if (observations.length === 2) {
        response.writeHead(307, { Location: "/redirect-trap" }).end();
      } else {
        const result = await sessionRoute.POST(input);
        statuses.push(result.status);
        response.writeHead(result.status, Object.fromEntries(result.headers)).end(await result.text());
      }
    } else {
      if (request.url !== "/favicon.ico") serverFailed = true;
      response.writeHead(404).end();
    }
  } catch {
    serverFailed = true;
    response.writeHead(500).end();
  }
});

async function listen(instance) {
  await new Promise((ready, reject) => {
    instance.once("error", reject);
    instance.listen(0, "127.0.0.1", ready);
  });
  return `http://127.0.0.1:${instance.address().port}`;
}

const tempDirectory = realpathSync(tmpdir());
const profile = mkdtempSync(join(tempDirectory, "repo-feedback-browser-native-"));
try {
  foreignOrigin = await listen(foreign);
  origin = await listen(server);
  const chrome = spawn(chromePath, [
    "--headless", "--disable-gpu", "--disable-background-networking", "--disable-component-update",
    "--disable-extensions", "--disable-sync", "--no-first-run", "--no-default-browser-check", "--no-proxy-server",
    "--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1", "--user-data-dir=" + profile,
    "--dump-dom", origin + page,
  ], { windowsHide: true, stdio: ["ignore", "pipe", "ignore"] });
  let dom = "";
  chrome.stdout.setEncoding("utf8").on("data", (chunk) => { dom += chunk; });
  const timeout = setTimeout(() => chrome.kill(), 20_000);
  try {
    const code = await new Promise((finish, reject) => {
      chrome.once("error", reject);
      chrome.once("close", finish);
    });
    assert.equal(code, 0, "Chrome exited before completing the fixture.");
    assert.equal(serverFailed, false, "The fixture received an unexpected request or server error.");
    const expected = {
      post: true, exactOrigin: true, sameOrigin: true, sameOriginMode: true,
      exactBearer: true, noReferrer: true, noCookie: true, noBody: true,
    };
    assert.deepEqual(observations[0], expected, "Native request headers and body must match the route contract.");
    assert.deepEqual(statuses, [200]);
    assert.deepEqual(readinessStatuses, [200, 200, 200]);
    assert.deepEqual(observations, [expected, expected]);
    assert.equal(verified, 1);
    assert.equal(foreignRequests, 0);
    assert.equal(/<pre id="result">([^<]*)<\/pre>/.exec(dom)?.[1], "PASS_NATIVE_FEEDBACK_SESSION");
    console.log("PASS_NATIVE_FEEDBACK_SESSION exact origin, no Referer or cookies, fixed bodyless POST, no foreign requests");
  } finally {
    clearTimeout(timeout);
  }
} finally {
  hold?.end();
  for (const instance of [server, foreign]) {
    instance.closeAllConnections();
    instance.close();
  }
  const absoluteProfile = realpathSync(profile);
  if (dirname(absoluteProfile) === tempDirectory) rmSync(absoluteProfile, { recursive: true, maxRetries: 5 });
}
