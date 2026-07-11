import { describe, expect, it } from "vitest";
import { classifyFrontend, sandboxUrls, classifyBackend, codespacesUrl } from "./frontend-detect";

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

describe("classifyBackend", () => {
  it("detects FastAPI from requirements.txt", () => {
    const result = classifyBackend({ requirementsTxt: "fastapi==0.95.0\nuvicorn" });
    expect(result).toEqual({ framework: "FastAPI", runtime: "python", devCommand: "uvicorn main:app --reload" });
  });

  it("detects Flask from Pipfile", () => {
    const result = classifyBackend({ pipfile: "[packages]\nflask = \"*\"" });
    expect(result).toEqual({ framework: "Flask", runtime: "python", devCommand: "flask run" });
  });

  it("detects Django from pyproject.toml", () => {
    const result = classifyBackend({ pyprojectToml: "[tool.poetry.dependencies]\ndjango = \"^4.0\"" });
    expect(result).toEqual({ framework: "Django", runtime: "python", devCommand: "python manage.py runserver" });
  });

  it("prioritizes FastAPI over Flask when both present", () => {
    const result = classifyBackend({ requirementsTxt: "fastapi\nflask" });
    expect(result?.framework).toBe("FastAPI");
  });

  it("detects Express from package.json", () => {
    const pkg = JSON.stringify({ dependencies: { express: "^4.0.0" } });
    const result = classifyBackend({ packageJson: pkg });
    expect(result).toEqual({ framework: "Express", runtime: "node", devCommand: "node server" });
  });

  it("detects NestJS from package.json", () => {
    const pkg = JSON.stringify({ dependencies: { "@nestjs/core": "^9.0.0" } });
    const result = classifyBackend({ packageJson: pkg });
    expect(result).toEqual({ framework: "NestJS", runtime: "node", devCommand: "nest start --watch" });
  });

  it("prioritizes FastAPI (Python) over Express (Node) when both present", () => {
    const pkg = JSON.stringify({ dependencies: { express: "^4.0.0" } });
    const result = classifyBackend({
      packageJson: pkg,
      requirementsTxt: "fastapi\nuvicorn",
    });
    expect(result?.framework).toBe("FastAPI");
    expect(result?.runtime).toBe("python");
  });

  it("returns null when nothing matches", () => {
    const pkg = JSON.stringify({ dependencies: { lodash: "^4.0.0" } });
    const result = classifyBackend({ packageJson: pkg });
    expect(result).toBeNull();
  });

  it("returns null for invalid package.json but detects Python deps", () => {
    const result = classifyBackend({
      packageJson: "not valid json {",
      requirementsTxt: "flask",
    });
    expect(result).toEqual({ framework: "Flask", runtime: "python", devCommand: "flask run" });
  });

  it("detects Fastify with custom dev script", () => {
    const pkg = JSON.stringify({
      dependencies: { fastify: "^4.0.0" },
      scripts: { dev: "fastify start --watch" },
    });
    const result = classifyBackend({ packageJson: pkg });
    expect(result).toEqual({ framework: "Fastify", runtime: "node", devCommand: "fastify start --watch" });
  });

  it("detects Koa with fallback to start script", () => {
    const pkg = JSON.stringify({
      dependencies: { koa: "^2.0.0" },
      scripts: { start: "node app.js" },
    });
    const result = classifyBackend({ packageJson: pkg });
    expect(result).toEqual({ framework: "Koa", runtime: "node", devCommand: "node app.js" });
  });
});

describe("codespacesUrl", () => {
  it("composes Codespaces URL from owner/repo", () => {
    const url = codespacesUrl("owner/repo");
    expect(url).toBe("https://codespaces.new/owner/repo");
  });

  it("handles repos with hyphens and numbers", () => {
    const url = codespacesUrl("my-org/my-repo-123");
    expect(url).toBe("https://codespaces.new/my-org/my-repo-123");
  });
});
