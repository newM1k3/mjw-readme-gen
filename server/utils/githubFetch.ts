const MAX_BYTES = 40 * 1024 * 1024; // 40 MB
const TIMEOUT_MS = 30_000;

const GITHUB_URL_RE = /^(?:https?:\/\/)?(?:www\.)?github\.com\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)/i;

export function parseGithubRepo(url: string): { owner: string; repo: string } {
  const trimmed = (url || "").trim();
  const m = GITHUB_URL_RE.exec(trimmed);
  if (m) {
    return { owner: m[1], repo: m[2].replace(/\.git$/, "").replace(/\/$/, "") };
  }
  const parts = trimmed.split("/");
  if (parts.length === 2 && parts[0] && parts[1]) {
    return { owner: parts[0], repo: parts[1] };
  }
  throw new Error("Enter a valid public GitHub repo URL (e.g. https://github.com/owner/repo).");
}

export async function fetchRepoZip(url: string): Promise<{ buffer: Buffer; repoName: string }> {
  const { owner, repo } = parseGithubRepo(url);
  const apiUrl = `https://api.github.com/repos/${owner}/${repo}/zipball`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(apiUrl, {
      headers: {
        "User-Agent": "mjw-readme-gen",
        "Accept": "application/vnd.github+json",
      },
      signal: controller.signal,
      redirect: "follow",
    });
  } catch (err: any) {
    clearTimeout(timer);
    if (err?.name === "AbortError") {
      throw new Error("GitHub request timed out after 30 seconds.");
    }
    throw new Error(`Could not reach GitHub: ${err?.message || err}`);
  } finally {
    clearTimeout(timer);
  }

  if (response.status === 404) {
    throw new Error(`Repository '${owner}/${repo}' not found or is private.`);
  }
  if (response.status === 403) {
    throw new Error("GitHub rate limit reached. Please try again in a few minutes.");
  }
  if (!response.ok) {
    throw new Error(`GitHub returned status ${response.status} for '${owner}/${repo}'.`);
  }

  // Stream with size guard
  const reader = response.body?.getReader();
  if (!reader) throw new Error("No response body from GitHub.");

  const chunks: Uint8Array[] = [];
  let total = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      total += value.length;
      if (total > MAX_BYTES) {
        reader.cancel();
        throw new Error("Repository archive exceeds the 40 MB limit.");
      }
      chunks.push(value);
    }
  }

  const buffer = Buffer.concat(chunks.map((c) => Buffer.from(c)));
  return { buffer, repoName: repo };
}
