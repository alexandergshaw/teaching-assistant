// Classify a repository's frontend framework from its package.json so the UI
// can offer one-click in-browser spin-up (StackBlitz/CodeSandbox WebContainers).

export interface FrontendInfo {
  framework: string;
  devCommand: string;
}

export function classifyFrontend(packageJsonText: string): FrontendInfo | null {
  let pkg: Record<string, unknown>;
  try {
    pkg = JSON.parse(packageJsonText);
  } catch {
    return null;
  }

  // Merge dependencies and devDependencies
  const allDeps = new Set<string>();
  const deps = pkg.dependencies as Record<string, unknown> | undefined;
  const devDeps = pkg.devDependencies as Record<string, unknown> | undefined;
  const scripts = pkg.scripts as Record<string, string> | undefined;

  if (deps && typeof deps === "object") {
    for (const key of Object.keys(deps)) {
      allDeps.add(key);
    }
  }
  if (devDeps && typeof devDeps === "object") {
    for (const key of Object.keys(devDeps)) {
      allDeps.add(key);
    }
  }

  // Order of checks: first match wins
  if (allDeps.has("next")) {
    return { framework: "Next.js", devCommand: "next dev" };
  }

  if (allDeps.has("@remix-run/react") || allDeps.has("@remix-run/node")) {
    return { framework: "Remix", devCommand: "remix dev" };
  }

  if (allDeps.has("gatsby")) {
    return { framework: "Gatsby", devCommand: "gatsby develop" };
  }

  if (allDeps.has("astro")) {
    return { framework: "Astro", devCommand: "astro dev" };
  }

  if (allDeps.has("vite")) {
    return { framework: "Vite", devCommand: "vite" };
  }

  if (allDeps.has("react-scripts")) {
    return { framework: "Create React App", devCommand: "react-scripts start" };
  }

  if (allDeps.has("@angular/core")) {
    return { framework: "Angular", devCommand: "ng serve" };
  }

  if (allDeps.has("svelte") || allDeps.has("@sveltejs/kit")) {
    return { framework: "Svelte", devCommand: "vite dev" };
  }

  if (allDeps.has("vue") || allDeps.has("nuxt")) {
    if (allDeps.has("nuxt")) {
      return { framework: "Nuxt", devCommand: "nuxt dev" };
    }
    return { framework: "Vue", devCommand: "vite" };
  }

  if (allDeps.has("react")) {
    const devCmd = scripts?.dev ?? scripts?.start ?? "npm start";
    return { framework: "React", devCommand: devCmd };
  }

  return null;
}

export function sandboxUrls(fullName: string): { stackblitz: string; codesandbox: string } {
  return {
    stackblitz: `https://stackblitz.com/github/${fullName}`,
    codesandbox: `https://codesandbox.io/p/github/${fullName}`,
  };
}
