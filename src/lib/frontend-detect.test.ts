import { describe, expect, it } from "vitest";
import { classifyFrontend, sandboxUrls } from "./frontend-detect";

describe("classifyFrontend", () => {
  it("detects Next.js from dependencies", () => {
    const pkg = JSON.stringify({ dependencies: { next: "^13.0.0" } });
    const result = classifyFrontend(pkg);
    expect(result).toEqual({ framework: "Next.js", devCommand: "next dev" });
  });

  it("detects Vite from devDependencies", () => {
    const pkg = JSON.stringify({ devDependencies: { vite: "^4.0.0" } });
    const result = classifyFrontend(pkg);
    expect(result).toEqual({ framework: "Vite", devCommand: "vite" });
  });

  it("detects Create React App", () => {
    const pkg = JSON.stringify({ dependencies: { "react-scripts": "^5.0.0" } });
    const result = classifyFrontend(pkg);
    expect(result).toEqual({ framework: "Create React App", devCommand: "react-scripts start" });
  });

  it("prioritizes Next.js over React", () => {
    const pkg = JSON.stringify({
      dependencies: {
        next: "^13.0.0",
        react: "^18.0.0",
      },
    });
    const result = classifyFrontend(pkg);
    expect(result).toEqual({ framework: "Next.js", devCommand: "next dev" });
  });

  it("detects plain React and falls back to npm start", () => {
    const pkg = JSON.stringify({
      dependencies: { react: "^18.0.0" },
      scripts: { start: "react-app-rewired start" },
    });
    const result = classifyFrontend(pkg);
    expect(result).toEqual({ framework: "React", devCommand: "react-app-rewired start" });
  });

  it("detects plain React with custom dev script", () => {
    const pkg = JSON.stringify({
      dependencies: { react: "^18.0.0" },
      scripts: { dev: "vite" },
    });
    const result = classifyFrontend(pkg);
    expect(result).toEqual({ framework: "React", devCommand: "vite" });
  });

  it("returns null for backend-only package.json", () => {
    const pkg = JSON.stringify({ dependencies: { express: "^4.0.0" } });
    const result = classifyFrontend(pkg);
    expect(result).toBeNull();
  });

  it("returns null for invalid JSON", () => {
    const result = classifyFrontend("not valid json {");
    expect(result).toBeNull();
  });

  it("detects Remix", () => {
    const pkg = JSON.stringify({ dependencies: { "@remix-run/react": "^1.0.0" } });
    const result = classifyFrontend(pkg);
    expect(result).toEqual({ framework: "Remix", devCommand: "remix dev" });
  });

  it("detects Gatsby", () => {
    const pkg = JSON.stringify({ devDependencies: { gatsby: "^4.0.0" } });
    const result = classifyFrontend(pkg);
    expect(result).toEqual({ framework: "Gatsby", devCommand: "gatsby develop" });
  });

  it("detects Astro", () => {
    const pkg = JSON.stringify({ dependencies: { astro: "^2.0.0" } });
    const result = classifyFrontend(pkg);
    expect(result).toEqual({ framework: "Astro", devCommand: "astro dev" });
  });

  it("detects Angular", () => {
    const pkg = JSON.stringify({ dependencies: { "@angular/core": "^15.0.0" } });
    const result = classifyFrontend(pkg);
    expect(result).toEqual({ framework: "Angular", devCommand: "ng serve" });
  });

  it("detects SvelteKit", () => {
    const pkg = JSON.stringify({ devDependencies: { "@sveltejs/kit": "^1.0.0" } });
    const result = classifyFrontend(pkg);
    expect(result).toEqual({ framework: "Svelte", devCommand: "vite dev" });
  });

  it("detects Nuxt over Vue", () => {
    const pkg = JSON.stringify({
      dependencies: {
        vue: "^3.0.0",
        nuxt: "^3.0.0",
      },
    });
    const result = classifyFrontend(pkg);
    expect(result).toEqual({ framework: "Nuxt", devCommand: "nuxt dev" });
  });

  it("detects Vue when Nuxt not present", () => {
    const pkg = JSON.stringify({ dependencies: { vue: "^3.0.0" } });
    const result = classifyFrontend(pkg);
    expect(result).toEqual({ framework: "Vue", devCommand: "vite" });
  });

  it("returns null for empty package.json", () => {
    const pkg = JSON.stringify({});
    const result = classifyFrontend(pkg);
    expect(result).toBeNull();
  });
});

describe("sandboxUrls", () => {
  it("composes both sandbox URLs from owner/repo", () => {
    const urls = sandboxUrls("owner/repo");
    expect(urls.stackblitz).toBe("https://stackblitz.com/github/owner/repo");
    expect(urls.codesandbox).toBe("https://codesandbox.io/p/github/owner/repo");
  });

  it("handles repos with hyphens and numbers", () => {
    const urls = sandboxUrls("my-org/my-repo-123");
    expect(urls.stackblitz).toBe("https://stackblitz.com/github/my-org/my-repo-123");
    expect(urls.codesandbox).toBe("https://codesandbox.io/p/github/my-org/my-repo-123");
  });
});
