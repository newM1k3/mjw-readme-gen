import { describe, expect, it } from "vitest";
import {
  buildContext,
  isScaffoldName,
  SCAFFOLD_NAMES,
} from "./utils/zipParser";
import { parseGithubRepo } from "./utils/githubFetch";
import { MJW_BANNER, buildSystemPrompt } from "./utils/llmGenerator";

// ─── isScaffoldName ───────────────────────────────────────────────────────

describe("isScaffoldName", () => {
  it("identifies known scaffold names", () => {
    expect(isScaffoldName("vite-react-typescript-starter")).toBe(true);
    expect(isScaffoldName("my-app")).toBe(true);
    expect(isScaffoldName("starter")).toBe(true);
    expect(isScaffoldName("template")).toBe(true);
    expect(isScaffoldName("project")).toBe(true);
    expect(isScaffoldName("app")).toBe(true);
  });

  it("is case-insensitive", () => {
    expect(isScaffoldName("MY-APP")).toBe(true);
    expect(isScaffoldName("Starter")).toBe(true);
    expect(isScaffoldName("VITE-REACT-TYPESCRIPT-STARTER")).toBe(true);
  });

  it("returns false for real project names", () => {
    expect(isScaffoldName("puzzle-flow-ai")).toBe(false);
    expect(isScaffoldName("mjw-readme-gen")).toBe(false);
    expect(isScaffoldName("awt-dashboard")).toBe(false);
    expect(isScaffoldName("immersivekit")).toBe(false);
  });

  it("returns true for empty or whitespace-only names", () => {
    expect(isScaffoldName("")).toBe(true);
    expect(isScaffoldName("   ")).toBe(true);
  });

  it("SCAFFOLD_NAMES set is exported and contains expected entries", () => {
    expect(SCAFFOLD_NAMES.has("vite-react-typescript-starter")).toBe(true);
    expect(SCAFFOLD_NAMES.has("my-app")).toBe(true);
    expect(SCAFFOLD_NAMES.size).toBeGreaterThan(5);
  });
});

// ─── buildContext ─────────────────────────────────────────────────────────

describe("buildContext", () => {
  it("includes project name and file count", () => {
    const ctx = buildContext({
      projectName: "my-app",
      fileCount: 42,
      stack: ["React", "TypeScript"],
      dependencies: { react: "^18.0.0", typescript: "^5.0.0" },
      scripts: { dev: "vite", build: "vite build" },
      envVars: ["VITE_API_URL", "DATABASE_URL"],
      deployment: ["Netlify"],
      topExtensions: [["ts", 20], ["tsx", 15]],
      configFiles: {},
      existingReadme: "",
      tree: "src/\n  index.ts",
    });

    expect(ctx).toContain("my-app");
    expect(ctx).toContain("42");
    expect(ctx).toContain("React");
    expect(ctx).toContain("TypeScript");
    expect(ctx).toContain("VITE_API_URL");
    expect(ctx).toContain("DATABASE_URL");
    expect(ctx).toContain("Netlify");
    expect(ctx).toContain("dev: vite");
  });

  it("uses projectNameOverride when provided", () => {
    const ctx = buildContext({
      projectName: "vite-react-typescript-starter",
      fileCount: 10,
      stack: [],
      dependencies: {},
      scripts: {},
      envVars: [],
      deployment: [],
      topExtensions: [],
      configFiles: {},
      existingReadme: "",
      tree: "",
      projectNameOverride: "PuzzleFlow AI",
    });

    expect(ctx).toContain("PuzzleFlow AI");
    expect(ctx).not.toContain("vite-react-typescript-starter");
  });

  it("falls back to projectName when override is empty string", () => {
    const ctx = buildContext({
      projectName: "real-project-name",
      fileCount: 5,
      stack: [],
      dependencies: {},
      scripts: {},
      envVars: [],
      deployment: [],
      topExtensions: [],
      configFiles: {},
      existingReadme: "",
      tree: "",
      projectNameOverride: "",
    });

    expect(ctx).toContain("real-project-name");
  });

  it("falls back to projectName when override is whitespace only", () => {
    const ctx = buildContext({
      projectName: "real-project-name",
      fileCount: 5,
      stack: [],
      dependencies: {},
      scripts: {},
      envVars: [],
      deployment: [],
      topExtensions: [],
      configFiles: {},
      existingReadme: "",
      tree: "",
      projectNameOverride: "   ",
    });

    expect(ctx).toContain("real-project-name");
  });

  it("includes existing README excerpt when present", () => {
    const ctx = buildContext({
      projectName: "test",
      fileCount: 1,
      stack: [],
      dependencies: {},
      scripts: {},
      envVars: [],
      deployment: [],
      topExtensions: [],
      configFiles: {},
      existingReadme: "# My Old README\nSome content here.",
      tree: "",
    });

    expect(ctx).toContain("My Old README");
    expect(ctx).toContain("EXISTING README");
  });

  it("omits existing README section when empty", () => {
    const ctx = buildContext({
      projectName: "test",
      fileCount: 1,
      stack: [],
      dependencies: {},
      scripts: {},
      envVars: [],
      deployment: [],
      topExtensions: [],
      configFiles: {},
      existingReadme: "",
      tree: "",
    });

    expect(ctx).not.toContain("EXISTING README");
  });

  it("includes config file content in context", () => {
    const ctx = buildContext({
      projectName: "test",
      fileCount: 1,
      stack: [],
      dependencies: {},
      scripts: {},
      envVars: [],
      deployment: [],
      topExtensions: [],
      configFiles: { "netlify.toml": "[build]\n  command = \"npm run build\"" },
      existingReadme: "",
      tree: "",
    });

    expect(ctx).toContain("netlify.toml");
    expect(ctx).toContain("npm run build");
  });

  it("handles empty analysis gracefully", () => {
    const ctx = buildContext({
      projectName: "Project",
      fileCount: 0,
      stack: [],
      dependencies: {},
      scripts: {},
      envVars: [],
      deployment: [],
      topExtensions: [],
      configFiles: {},
      existingReadme: "",
      tree: "",
    });

    expect(ctx).toContain("Project");
    expect(ctx).toContain("0");
    expect(typeof ctx).toBe("string");
  });

  it("labels PROJECT NAME without the (guess) suffix when override is used", () => {
    const ctx = buildContext({
      projectName: "fallback",
      fileCount: 1,
      stack: [],
      dependencies: {},
      scripts: {},
      envVars: [],
      deployment: [],
      topExtensions: [],
      configFiles: {},
      existingReadme: "",
      tree: "",
      projectNameOverride: "Real Name",
    });

    expect(ctx).toContain("PROJECT NAME: Real Name");
  });
});

// ─── GitHub URL parser ────────────────────────────────────────────────────

describe("parseGithubRepo", () => {
  it("parses a full HTTPS GitHub URL", () => {
    const result = parseGithubRepo("https://github.com/newM1k3/emer-readme-gen");
    expect(result.owner).toBe("newM1k3");
    expect(result.repo).toBe("emer-readme-gen");
  });

  it("parses a URL with trailing slash", () => {
    const result = parseGithubRepo("https://github.com/owner/repo/");
    expect(result.owner).toBe("owner");
    expect(result.repo).toBe("repo");
  });

  it("parses a URL with .git suffix", () => {
    const result = parseGithubRepo("https://github.com/owner/repo.git");
    expect(result.owner).toBe("owner");
    expect(result.repo).toBe("repo");
  });

  it("parses owner/repo shorthand", () => {
    const result = parseGithubRepo("owner/repo");
    expect(result.owner).toBe("owner");
    expect(result.repo).toBe("repo");
  });

  it("throws on invalid URL", () => {
    expect(() => parseGithubRepo("not-a-url")).toThrow();
    expect(() => parseGithubRepo("")).toThrow();
  });

  it("handles URLs with http (not https)", () => {
    const result = parseGithubRepo("http://github.com/owner/repo");
    expect(result.owner).toBe("owner");
    expect(result.repo).toBe("repo");
  });

  it("handles URLs with www prefix", () => {
    const result = parseGithubRepo("https://www.github.com/owner/repo");
    expect(result.owner).toBe("owner");
    expect(result.repo).toBe("repo");
  });
});

// ─── MJW Banner ───────────────────────────────────────────────────────────

describe("MJW_BANNER", () => {
  it("contains centered alignment", () => {
    expect(MJW_BANNER).toContain('align="center"');
  });

  it("contains MJW Design reference", () => {
    expect(MJW_BANNER).toContain("MJW Design");
  });

  it("ends with double newline for proper markdown separation", () => {
    expect(MJW_BANNER.endsWith("\n\n")).toBe(true);
  });

  it("contains a valid image tag", () => {
    expect(MJW_BANNER).toContain("![MJW Design]");
  });

  it("contains a hyperlink to mjwdesign.ca", () => {
    expect(MJW_BANNER).toContain("mjwdesign.ca");
  });
});

// ─── buildSystemPrompt ────────────────────────────────────────────────────

describe("buildSystemPrompt", () => {
  it("returns default prompt when no reference is provided", () => {
    const prompt = buildSystemPrompt();
    expect(prompt).toContain("expert technical writer");
    expect(prompt).toContain("README.md");
    expect(prompt).toContain("Tech stack");
  });

  it("returns default prompt when reference is empty string", () => {
    const prompt = buildSystemPrompt("");
    expect(prompt).toContain("expert technical writer");
    expect(prompt).not.toContain("REFERENCE README");
  });

  it("returns default prompt when reference is whitespace only", () => {
    const prompt = buildSystemPrompt("   ");
    expect(prompt).not.toContain("REFERENCE README");
  });

  it("injects reference README into prompt when provided", () => {
    const ref = "# My Reference README\nThis is the style to follow.";
    const prompt = buildSystemPrompt(ref);
    expect(prompt).toContain("REFERENCE README");
    expect(prompt).toContain("My Reference README");
    expect(prompt).toContain("style to emulate");
  });

  it("truncates very long reference READMEs to 12000 chars", () => {
    const longRef = "x".repeat(20000);
    const prompt = buildSystemPrompt(longRef);
    // The injected reference should be capped; total prompt should not grow unbounded
    expect(prompt.length).toBeLessThan(15000);
  });

  it("instructs model to output only raw markdown", () => {
    const prompt = buildSystemPrompt();
    expect(prompt).toContain("Output ONLY the raw markdown");
  });

  it("reference prompt instructs model not to copy source facts", () => {
    const prompt = buildSystemPrompt("# Reference");
    expect(prompt).toContain("Do NOT copy the reference");
  });
});
