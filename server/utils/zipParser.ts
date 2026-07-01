import JSZip from "jszip";

const MAX_FILES = 2000;
const MAX_CONFIG_CHARS = 8000;

const IGNORED_DIRS = new Set([
  "node_modules", ".git", "__pycache__", ".venv", "venv", "env",
  "dist", "build", ".next", ".nuxt", "coverage", ".cache",
  ".idea", ".vscode", "vendor",
]);

const CONFIG_FILES = new Set([
  "package.json", "requirements.txt", "pyproject.toml", "cargo.toml",
  "go.mod", "pom.xml", "build.gradle", "composer.json", "gemfile",
  "dockerfile", "docker-compose.yml", "docker-compose.yaml",
  ".env.example", ".env.sample", ".env.template",
  "netlify.toml", "vercel.json", "render.yaml", "railway.toml",
  "tsconfig.json", "vite.config.ts", "vite.config.js",
  "next.config.js", "next.config.ts",
  "readme.md", "readme.txt",
]);

const STACK_MARKERS: Record<string, string[]> = {
  "React": ["react", "react-dom"],
  "Next.js": ["next"],
  "Vue": ["vue"],
  "Angular": ["@angular/core"],
  "Svelte": ["svelte"],
  "TypeScript": ["typescript"],
  "Tailwind CSS": ["tailwindcss"],
  "FastAPI": ["fastapi"],
  "Django": ["django"],
  "Flask": ["flask"],
  "Express": ["express"],
  "NestJS": ["@nestjs/core"],
  "PostgreSQL": ["pg", "postgres", "psycopg2"],
  "MongoDB": ["pymongo", "mongoose", "motor"],
  "MySQL": ["mysql2", "mysql"],
  "Redis": ["redis", "ioredis"],
  "Prisma": ["@prisma/client"],
  "Drizzle": ["drizzle-orm"],
  "tRPC": ["@trpc/server"],
  "GraphQL": ["graphql", "apollo-server"],
  "Stripe": ["stripe"],
  "Supabase": ["@supabase/supabase-js"],
  "PocketBase": ["pocketbase"],
  "Docker": [],
  "Vite": ["vite"],
};

function isIgnored(parts: string[]): boolean {
  return parts.some((p) => IGNORED_DIRS.has(p.toLowerCase()));
}

function stripRoot(names: string[]): { paths: string[]; root: string } {
  if (names.length === 0) return { paths: [], root: "" };
  const parts0 = names[0].split("/");
  const root = parts0.length > 1 ? parts0[0] : "";
  const paths = names.map((n) => (root ? n.slice(root.length + 1) : n)).filter(Boolean);
  return { paths, root };
}

function detectStack(paths: string[], configs: Record<string, string>): {
  stack: string[];
  deps: Record<string, string>;
  scripts: Record<string, string>;
} {
  const stack: string[] = [];
  let deps: Record<string, string> = {};
  let scripts: Record<string, string> = {};

  // Detect from package.json
  if (configs["package.json"]) {
    try {
      const pkg = JSON.parse(configs["package.json"]);
      const allDeps = { ...pkg.dependencies, ...pkg.devDependencies };
      deps = allDeps;
      scripts = pkg.scripts || {};
      for (const [tech, markers] of Object.entries(STACK_MARKERS)) {
        if (markers.some((m) => allDeps[m])) {
          stack.push(tech);
        }
      }
    } catch {}
  }

  // Detect from requirements.txt
  if (configs["requirements.txt"]) {
    const lines = configs["requirements.txt"].split("\n").map((l) => l.trim().toLowerCase());
    for (const [tech, markers] of Object.entries(STACK_MARKERS)) {
      if (markers.some((m) => lines.some((l) => l.startsWith(m.toLowerCase())))) {
        if (!stack.includes(tech)) stack.push(tech);
      }
    }
    if (lines.length > 0 && !stack.includes("Python")) stack.push("Python");
  }

  // Detect from file extensions
  const extCounts: Record<string, number> = {};
  for (const p of paths) {
    const ext = p.split(".").pop()?.toLowerCase() || "";
    extCounts[ext] = (extCounts[ext] || 0) + 1;
  }
  if ((extCounts["py"] || 0) > 2 && !stack.includes("Python")) stack.push("Python");
  if ((extCounts["go"] || 0) > 2) stack.push("Go");
  if ((extCounts["rs"] || 0) > 2) stack.push("Rust");
  if ((extCounts["java"] || 0) > 2) stack.push("Java");
  if (configs["dockerfile"] || paths.some((p) => p.toLowerCase() === "dockerfile")) {
    stack.push("Docker");
  }

  return { stack: Array.from(new Set(stack)), deps, scripts };
}

function detectDeploy(paths: string[]): string[] {
  const targets: string[] = [];
  const lp = paths.map((p) => p.toLowerCase());
  if (lp.some((p) => p.includes("netlify.toml"))) targets.push("Netlify");
  if (lp.some((p) => p.includes("vercel.json"))) targets.push("Vercel");
  if (lp.some((p) => p.includes("render.yaml"))) targets.push("Render");
  if (lp.some((p) => p.includes("railway.toml"))) targets.push("Railway");
  if (lp.some((p) => p === "dockerfile" || p.includes("/dockerfile"))) targets.push("Docker");
  if (lp.some((p) => p.includes(".github/workflows"))) targets.push("GitHub Actions");
  return targets;
}

function extractEnvVars(configs: Record<string, string>): string[] {
  const envFile = configs[".env.example"] || configs[".env.sample"] || configs[".env.template"] || "";
  if (!envFile) return [];
  return envFile
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("#") && l.includes("="))
    .map((l) => l.split("=")[0].trim())
    .filter(Boolean);
}

function buildTree(paths: string[]): string {
  const tree: Record<string, boolean> = {};
  for (const p of paths.slice(0, 200)) {
    const parts = p.split("/");
    for (let i = 1; i <= parts.length; i++) {
      tree[parts.slice(0, i).join("/")] = i === parts.length;
    }
  }
  const lines: string[] = [];
  for (const [key, isFile] of Object.entries(tree)) {
    const depth = key.split("/").length - 1;
    const name = key.split("/").pop() || "";
    lines.push("  ".repeat(depth) + (isFile ? "📄 " : "📁 ") + name);
  }
  return lines.slice(0, 100).join("\n");
}

export interface RepoAnalysis {
  projectName: string;
  fileCount: number;
  stack: string[];
  dependencies: Record<string, string>;
  scripts: Record<string, string>;
  envVars: string[];
  deployment: string[];
  topExtensions: [string, number][];
  configFiles: Record<string, string>;
  existingReadme: string;
  tree: string;
}

export async function analyzeZip(buffer: Buffer): Promise<RepoAnalysis> {
  const zip = await JSZip.loadAsync(buffer);
  const allNames = Object.keys(zip.files).slice(0, MAX_FILES);
  const { paths, root } = stripRoot(allNames);

  const validPaths = paths.filter((p) => {
    const parts = p.split("/");
    return !isIgnored(parts) && !zip.files[root ? `${root}/${p}` : p]?.dir;
  });

  // Read config files
  const configs: Record<string, string> = {};
  for (const p of validPaths) {
    const base = p.split("/").pop()?.toLowerCase() || "";
    if (CONFIG_FILES.has(base)) {
      const fullKey = root ? `${root}/${p}` : p;
      const file = zip.files[fullKey];
      if (file && !file.dir) {
        try {
          const content = await file.async("string");
          configs[base] = content.slice(0, MAX_CONFIG_CHARS);
        } catch {}
      }
    }
  }

  const { stack, deps, scripts } = detectStack(validPaths, configs);

  // Count extensions
  const extCounts: Record<string, number> = {};
  for (const p of validPaths) {
    const ext = p.split(".").pop()?.toLowerCase() || "other";
    extCounts[ext] = (extCounts[ext] || 0) + 1;
  }
  const topExtensions = Object.entries(extCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12) as [string, number][];

  // Guess project name
  let projectName = "Project";
  if (configs["package.json"]) {
    try {
      projectName = JSON.parse(configs["package.json"]).name || root || "Project";
    } catch {}
  } else if (root) {
    projectName = root;
  }

  return {
    projectName,
    fileCount: validPaths.length,
    stack,
    dependencies: deps,
    scripts,
    envVars: extractEnvVars(configs),
    deployment: detectDeploy(validPaths),
    topExtensions,
    configFiles: Object.fromEntries(
      Object.entries(configs).filter(([k]) => k !== "readme.md" && k !== "readme.txt")
    ),
    existingReadme: (configs["readme.md"] || configs["readme.txt"] || "").slice(0, 2000),
    tree: buildTree(validPaths),
  };
}

export function buildContext(analysis: RepoAnalysis): string {
  const parts: string[] = [
    `PROJECT NAME (guess): ${analysis.projectName}`,
    `TOTAL SOURCE FILES: ${analysis.fileCount}`,
    `DETECTED STACK: ${analysis.stack.join(", ") || "Unknown"}`,
    `DEPLOYMENT TARGETS: ${analysis.deployment.join(", ") || "None detected"}`,
  ];

  if (Object.keys(analysis.scripts).length > 0) {
    parts.push("SCRIPTS:\n" + Object.entries(analysis.scripts).map(([k, v]) => `  ${k}: ${v}`).join("\n"));
  }

  const depEntries = Object.entries(analysis.dependencies).slice(0, 60);
  if (depEntries.length > 0) {
    parts.push("DEPENDENCIES:\n" + depEntries.map(([k, v]) => `  ${k} ${v}`).join("\n"));
  }

  if (analysis.envVars.length > 0) {
    parts.push("ENVIRONMENT VARIABLES (from .env example):\n" + analysis.envVars.map((v) => `  ${v}`).join("\n"));
  }

  parts.push("TOP FILE TYPES: " + analysis.topExtensions.map(([e, c]) => `${e} (${c})`).join(", "));

  for (const [fname, content] of Object.entries(analysis.configFiles)) {
    parts.push(`--- FILE: ${fname} ---\n${content}`);
  }

  parts.push("DIRECTORY STRUCTURE:\n" + analysis.tree);

  if (analysis.existingReadme) {
    parts.push("EXISTING README (excerpt, for reference only):\n" + analysis.existingReadme);
  }

  return parts.join("\n\n");
}
