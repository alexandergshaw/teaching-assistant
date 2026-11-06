// Opt-in rendered check with synthetic data and a stub clipboard/storage boundary.
// From the repo root, pass an installed Chrome executable to:
// node src/tools/repo-feedback-editor-native.mjs "C:\Program Files\Google\Chrome\Application\chrome.exe"
import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, realpathSync, rmSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { transform } from "lightningcss";
import { rolldown } from "rolldown";
import { verifyEditor } from "./repo-feedback-editor-native.cases.mjs";

const chromePath = process.argv[2];
if (!chromePath) throw new Error("Pass the path to an installed Chrome executable.");

async function bundleFixture() {
  const stylesheet = [readFileSync(new URL("../app/globals.css", import.meta.url))];
  const bundle = await rolldown({
    input: fileURLToPath(new URL("./repo-feedback-editor-native.fixture.tsx", import.meta.url)),
    platform: "browser",
    transform: { jsx: "react-jsx", define: { "process.env.NODE_ENV": '"production"' } },
    resolve: { alias: { "@": fileURLToPath(new URL("../", import.meta.url)) } },
    plugins: [{
      name: "fixture-css-modules",
      load(id) {
        if (!id.endsWith(".module.css")) return;
        const { code, exports } = transform({ filename: id, code: readFileSync(id), cssModules: true });
        stylesheet.push(code);
        const classes = Object.fromEntries(Object.entries(exports).map(([key, entry]) => [key, entry.name]));
        return { code: `export default ${JSON.stringify(classes)};`, moduleType: "js" };
      },
    }],
  });
  try {
    const { output } = await bundle.generate({ format: "iife" });
    if (output.length !== 1 || output[0].type !== "chunk") throw new Error("Expected one fixture bundle.");
    return [output[0].code, Buffer.concat(stylesheet.map((css) => Buffer.from(css)))];
  } finally {
    await bundle.close();
  }
}

async function devToolsTarget(profile, chromeState, origin) {
  const deadline = Date.now() + 10000;
  while (Date.now() < deadline) {
    if (chromeState.closed) throw new Error(`Chrome stopped before exposing a page target (${chromeState.reason}).`);
    try {
      const [port] = readFileSync(join(profile, "DevToolsActivePort"), "utf8").split(/\r?\n/);
      if (!/^\d+$/.test(port)) throw new Error("DevTools port is not ready.");
      const response = await fetch(`http://127.0.0.1:${port}/json/list`, { signal: AbortSignal.timeout(1000) });
      const pages = await response.json();
      const page = pages.find(({ type, url }) => type === "page" && url === origin + "/");
      if (page && /^[\w-]+$/.test(page.id)) return `ws://127.0.0.1:${port}/devtools/page/${page.id}`;
    } catch {
      // Chrome publishes its debugger port and target asynchronously.
    }
    await delay(50);
  }
  throw new Error("Timed out waiting for the loopback Chrome page target.");
}

async function connect(target) {
  const socket = new WebSocket(target);
  try {
    await new Promise((ready, reject) => {
      socket.addEventListener("open", ready, { once: true });
      socket.addEventListener("error", () => reject(new Error("Could not connect to Chrome DevTools.")), { once: true });
      AbortSignal.timeout(3000).addEventListener("abort", () => reject(new Error("Chrome DevTools connection timed out.")));
    });
  } catch (error) {
    socket.close();
    throw error;
  }
  let nextId = 0;
  const pending = new Map();
  const pageErrors = [];
  socket.addEventListener("message", ({ data }) => {
    const { id, result, error, method, params } = JSON.parse(data);
    if (method === "Runtime.exceptionThrown") pageErrors.push(params.exceptionDetails);
    pending.get(id)?.(result, error);
  });
  return {
    pageErrors,
    close: () => socket.close(),
    send(method, params = {}) {
      const id = ++nextId;
      return new Promise((finish, reject) => {
        if (socket.readyState !== WebSocket.OPEN) return reject(new Error("Chrome DevTools disconnected."));
        const timer = setTimeout(() => {
          pending.delete(id);
          reject(new Error(`Chrome DevTools timed out on ${method}.`));
        }, 3000);
        pending.set(id, (result, error) => {
          clearTimeout(timer);
          pending.delete(id);
          if (error) reject(new Error(`${method}: ${error.message}`));
          else finish(result);
        });
        socket.send(JSON.stringify({ id, method, params }));
      });
    },
  };
}

const [script, css] = await bundleFixture();
const html = '<!doctype html><html lang="en"><meta charset="utf-8"><title>Retained feedback fixture</title>' +
  '<link rel="stylesheet" href="/fixture.css"><div id="root"></div><script src="/fixture.js"></script></html>';
const assets = new Map([
  ["/", ["text/html", html]],
  ["/fixture.css", ["text/css", css]],
  ["/fixture.js", ["text/javascript", script]],
]);
const server = createServer((request, response) => {
  const asset = assets.get(request.url);
  if (!asset) return response.writeHead(404).end();
  response.setHeader("content-type", `${asset[0]}; charset=utf-8`);
  response.setHeader("content-security-policy", "default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'");
  response.end(asset[1]);
});

const tempDirectory = realpathSync(tmpdir());
const profile = mkdtempSync(join(tempDirectory, "repo-feedback-editor-native-"));
let chrome;
let chromeClosed;
let cdp;
try {
  await new Promise((ready, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", ready);
  });
  const origin = `http://127.0.0.1:${server.address().port}`;
  chrome = spawn(chromePath, [
    "--headless", "--disable-gpu", "--disable-background-networking", "--disable-component-update",
    "--disable-extensions", "--disable-sync", "--no-first-run", "--no-default-browser-check", "--no-proxy-server",
    "--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1", "--remote-debugging-port=0",
    "--user-data-dir=" + profile, origin + "/",
  ], { windowsHide: true, stdio: "ignore" });
  const chromeState = { closed: false, reason: "unknown" };
  chromeClosed = new Promise((finish) => {
    chrome.once("error", (error) => { chromeState.reason = error.message; });
    chrome.once("close", (code) => {
      chromeState.closed = true;
      if (code !== null) chromeState.reason = `exit ${code}`;
      finish();
    });
  });
  cdp = await connect(await devToolsTarget(profile, chromeState, origin));
  await cdp.send("Runtime.enable");
  await verifyEditor(cdp);
  if (cdp.pageErrors.length) throw new Error(JSON.stringify(cdp.pageErrors[0]));
} finally {
  if (cdp) await cdp.send("Browser.close").catch(() => {});
  cdp?.close();
  chrome?.kill();
  await chromeClosed;
  server.closeAllConnections();
  server.close();
  const absoluteProfile = realpathSync(profile);
  if (dirname(absoluteProfile) === tempDirectory) rmSync(absoluteProfile, { recursive: true, maxRetries: 10 });
}
console.log("PASS_NATIVE_RETAINED_FEEDBACK_EDITOR keyboard, modal, draft isolation, clipboard status, course cache");
