import { invokeLLM, listLLMModels } from "../_core/llm";
import { ENV } from "../_core/env";

// MJW Design banner — centered HTML block prepended to every generated README
export const MJW_BANNER = `<div align="center">

![MJW Design](https://mjwdesign.ca/wp-content/uploads/2024/01/mjw-design-logo.png)

**Built with [MJW Design](https://mjwdesign.ca) — AI-Powered Development**

---

</div>

`;

const DEFAULT_SYSTEM_PROMPT = `You are an expert technical writer that generates polished, production-grade README.md files for software repositories.

You will receive a structured analysis of a repository. Your job is to write a COMPLETE, professional README.md that includes:

1. A clear project title and description
2. A features list
3. Tech stack table
4. Prerequisites and installation instructions
5. Usage / getting started guide
6. Environment variables table (if any detected)
7. Available scripts section
8. Project structure (directory tree)
9. Deployment notes (if deployment targets detected)
10. A Screenshots section with image placeholders (e.g. \`![App screenshot](public/screenshots/desktop.png)\`) noting they are placeholders
11. Contributing guidelines
12. License section

Rules:
- Use fenced code blocks for commands and directory trees
- Infer install/run commands from the detected stack and scripts
- Use exact dependency and script names from the analysis
- Output ONLY the raw markdown — no commentary, no surrounding \`\`\`markdown fences
- Make it professional, specific to this project, and immediately useful`;

export function buildSystemPrompt(referenceReadme?: string): string {
  const ref = (referenceReadme || "").trim();
  if (!ref) return DEFAULT_SYSTEM_PROMPT;

  return `You are an expert technical writer that generates polished, production-grade README.md files for software repositories.

You will receive (1) a REFERENCE README that defines the EXACT house style to emulate, and (2) a structured analysis of a target repository.

Your job: write a COMPLETE new README.md for the TARGET repository that faithfully mirrors the REFERENCE's structure, heading order, section names, tone, table usage, code-block conventions, badge/placeholder style, and overall formatting — but with content derived entirely from the target repository's analysis. Do NOT copy the reference's project-specific facts; only mirror its style and scaffolding.

Rules:
- Match the reference's heading hierarchy and ordering as closely as is sensible for the target project
- Reuse the reference's table layouts (e.g. Stack, Environment Variables) where the target has equivalent data
- Use fenced code blocks for commands and the directory tree
- Include a Screenshots section with image placeholders noting they are placeholders
- Infer install/run commands from the detected stack. Use exact dependency and script names from the analysis
- Output ONLY the raw markdown of the new README — no commentary, no surrounding \`\`\`markdown fences

=== REFERENCE README (style to emulate) ===
${ref.slice(0, 12000)}
=== END REFERENCE README ===`;
}

export interface GenerateOptions {
  context: string;
  modelId?: string;
  referenceReadme?: string;
  includeBanner?: boolean;
}

export interface ModelInfo {
  id: string;
  label: string;
}

export async function getAvailableModels(): Promise<ModelInfo[]> {
  try {
    const { data } = await listLLMModels();
    const preferred = ["claude", "gpt", "gemini"];
    const sorted = (data || []).sort((a: any, b: any) => {
      const ai = preferred.findIndex((p) => a.id.toLowerCase().includes(p));
      const bi = preferred.findIndex((p) => b.id.toLowerCase().includes(p));
      return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
    });
    return sorted.slice(0, 6).map((m: any) => ({
      id: m.id,
      label: m.id,
    }));
  } catch {
    return [
      { id: "claude-sonnet-4-5", label: "Claude Sonnet 4.5" },
      { id: "gpt-4o", label: "GPT-4o" },
    ];
  }
}

/** Non-streaming generation — used by tRPC procedures (rerun, etc.) */
export async function generateReadme(opts: GenerateOptions): Promise<string> {
  const { context, modelId, referenceReadme, includeBanner = true } = opts;

  const response = await invokeLLM({
    model: modelId,
    messages: [
      { role: "system", content: buildSystemPrompt(referenceReadme) },
      {
        role: "user",
        content: `Generate the README.md for this repository.\n\nREPOSITORY ANALYSIS:\n${context}`,
      },
    ],
  });

  const rawContent = response?.choices?.[0]?.message?.content;
  const content: string = typeof rawContent === "string" ? rawContent : (typeof response === "string" ? response : "");

  const readme = content.trim();
  return includeBanner ? MJW_BANNER + readme : readme;
}

/** Streaming generation — calls the Forge API with stream:true and pipes SSE chunks.
 *  Calls `onToken` for each text delta, resolves with the full assembled text. */
export async function streamReadme(opts: {
  context: string;
  modelId?: string;
  referenceReadme?: string;
  includeBanner?: boolean;
  onToken: (delta: string) => void;
  signal?: AbortSignal;
}): Promise<string> {
  const { context, modelId, referenceReadme, includeBanner = true, onToken, signal } = opts;

  const apiUrl =
    ENV.forgeApiUrl && ENV.forgeApiUrl.trim().length > 0
      ? `${ENV.forgeApiUrl.replace(/\/$/, "")}/v1/chat/completions`
      : "https://forge.manus.im/v1/chat/completions";

  const messages = [
    { role: "system", content: buildSystemPrompt(referenceReadme) },
    { role: "user", content: `Generate the README.md for this repository.\n\nREPOSITORY ANALYSIS:\n${context}` },
  ];

  const payload: Record<string, unknown> = {
    messages,
    stream: true,
  };
  if (modelId) payload.model = modelId;

  const llmRes = await fetch(apiUrl, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${ENV.forgeApiKey}`,
    },
    body: JSON.stringify(payload),
    signal,
  });

  if (!llmRes.ok) {
    const errText = await llmRes.text();
    throw new Error(`LLM streaming error ${llmRes.status}: ${errText}`);
  }

  const reader = llmRes.body?.getReader();
  if (!reader) throw new Error("No response body from LLM");

  const decoder = new TextDecoder();
  let assembled = "";
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed === "data: [DONE]") continue;
      if (!trimmed.startsWith("data: ")) continue;

      try {
        const json = JSON.parse(trimmed.slice(6));
        const delta = json?.choices?.[0]?.delta?.content;
        if (typeof delta === "string" && delta.length > 0) {
          assembled += delta;
          onToken(delta);
        }
      } catch {
        // Malformed SSE chunk — skip
      }
    }
  }

  const readme = assembled.trim();
  return includeBanner ? MJW_BANNER + readme : readme;
}
