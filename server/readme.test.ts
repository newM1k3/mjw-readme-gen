import { describe, expect, it, vi, beforeEach } from "vitest";
import { buildContext } from "./utils/zipParser";
import { parseGithubRepo } from "./utils/githubFetch";
import { MJW_BANNER } from "./utils/llmGenerator";

// ─── ZIP Parser tests ─────────────────────────────────────────────────────

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

  it("truncates large config files", () => {
    const bigContent = "x".repeat(10000);
    const ctx = buildContext({
      projectName: "test",
      fileCount: 1,
      stack: [],
      dependencies: {},
      scripts: {},
      envVars: [],
      deployment: [],
      topExtensions: [],
      configFiles: { "package.json": bigContent },
      existingReadme: "",
      tree: "",
    });
    // Context should exist and include the file reference
    expect(ctx).toContain("package.json");
  });
});

// ─── GitHub URL parser tests ──────────────────────────────────────────────

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
});

// ─── LLM Generator tests ─────────────────────────────────────────────────

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
});
