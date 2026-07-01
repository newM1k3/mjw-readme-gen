// Direct Anthropic Messages API client (replaces the Manus Forge LLM proxy).
import { ENV } from "./env";

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_MODELS_URL = "https://api.anthropic.com/v1/models";
const ANTHROPIC_VERSION = "2023-06-01";
const DEFAULT_MODEL = "claude-sonnet-5";
const DEFAULT_MAX_TOKENS = 8000;

export type AnthropicMessage = {
  role: "user" | "assistant";
  content: string;
};

export type InvokeParams = {
  system?: string;
  messages: AnthropicMessage[];
  model?: string;
  maxTokens?: number;
};

export type InvokeResult = {
  content: Array<{ type: string; text?: string }>;
  model: string;
  usage?: { input_tokens: number; output_tokens: number };
};

function assertApiKey() {
  if (!ENV.anthropicApiKey) {
    throw new Error("ANTHROPIC_API_KEY is not configured");
  }
}

function anthropicHeaders() {
  return {
    "content-type": "application/json",
    "x-api-key": ENV.anthropicApiKey,
    "anthropic-version": ANTHROPIC_VERSION,
  };
}

export async function invokeLLM(params: InvokeParams): Promise<InvokeResult> {
  assertApiKey();

  const payload: Record<string, unknown> = {
    model: params.model || DEFAULT_MODEL,
    max_tokens: params.maxTokens ?? DEFAULT_MAX_TOKENS,
    messages: params.messages,
  };
  if (params.system) payload.system = params.system;

  const response = await fetch(ANTHROPIC_API_URL, {
    method: "POST",
    headers: anthropicHeaders(),
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Anthropic invoke failed: ${response.status} ${response.statusText} – ${errorText}`);
  }

  return (await response.json()) as InvokeResult;
}

export type ModelInfo = { id: string; display_name?: string };

const FALLBACK_MODELS: ModelInfo[] = [
  { id: "claude-sonnet-5", display_name: "Claude Sonnet 5" },
  { id: "claude-opus-4-8", display_name: "Claude Opus 4.8" },
  { id: "claude-haiku-4-5-20251001", display_name: "Claude Haiku 4.5" },
];

export async function listLLMModels(): Promise<{ data: ModelInfo[] }> {
  assertApiKey();

  try {
    const response = await fetch(ANTHROPIC_MODELS_URL, { headers: anthropicHeaders() });
    if (!response.ok) return { data: FALLBACK_MODELS };
    const json = (await response.json()) as { data?: ModelInfo[] };
    return { data: json.data && json.data.length > 0 ? json.data : FALLBACK_MODELS };
  } catch {
    return { data: FALLBACK_MODELS };
  }
}

/** Streams a single-turn completion, calling onToken for each text delta. */
export async function streamLLM(opts: {
  system?: string;
  messages: AnthropicMessage[];
  model?: string;
  maxTokens?: number;
  onToken: (delta: string) => void;
  signal?: AbortSignal;
}): Promise<string> {
  assertApiKey();

  const payload: Record<string, unknown> = {
    model: opts.model || DEFAULT_MODEL,
    max_tokens: opts.maxTokens ?? DEFAULT_MAX_TOKENS,
    messages: opts.messages,
    stream: true,
  };
  if (opts.system) payload.system = opts.system;

  const response = await fetch(ANTHROPIC_API_URL, {
    method: "POST",
    headers: anthropicHeaders(),
    body: JSON.stringify(payload),
    signal: opts.signal,
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Anthropic streaming error ${response.status}: ${errText}`);
  }

  const reader = response.body?.getReader();
  if (!reader) throw new Error("No response body from Anthropic");

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
      if (!trimmed.startsWith("data: ")) continue;

      try {
        const json = JSON.parse(trimmed.slice(6));
        if (json.type === "content_block_delta" && json.delta?.type === "text_delta") {
          const delta: string = json.delta.text;
          assembled += delta;
          opts.onToken(delta);
        }
      } catch {
        // Malformed SSE chunk — skip
      }
    }
  }

  return assembled;
}
