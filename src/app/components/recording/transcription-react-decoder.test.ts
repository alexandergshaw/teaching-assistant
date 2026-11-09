import { describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";

describe("recording transcription transport and React action decoder", () => {
  it("demonstrates the production decoder rejection for the former large two-argument action", () => {
    const source = `
      const { decodeReply } = require("next/dist/compiled/react-server-dom-webpack-experimental/server.node");
      (async () => {
        const audio = "A".repeat(1100000);
        try { await decodeReply(JSON.stringify([audio, { provider: "gemini" }]), null); process.stdout.write("accepted"); }
        catch (error) { process.stdout.write(String(error.message)); }
      })().catch(() => process.exit(2));
    `;
    const child = spawnSync(process.execPath, ["--conditions=react-server", "-e", source], { cwd: process.cwd(), encoding: "utf8", env: { ...process.env, NODE_ENV: "production" }, timeout: 20000 });
    expect(child.error).toBeUndefined();
    expect(child.status).toBe(0);
    expect(child.stdout).toContain("Maximum array nesting exceeded");
  });
  it("keeps a large base64 string intact in a JSON request body", () => {
    const audio = "A".repeat(1100000);
    const decoded = JSON.parse(JSON.stringify({ audio, provider: "gemini" })) as { audio: string; provider: string };
    expect(decoded.audio).toBe(audio);
    expect(decoded.provider).toBe("gemini");
  });
});