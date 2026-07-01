/**
 * useStreamGenerate
 *
 * Consumes the SSE streaming endpoints:
 *   POST /api/readme/stream-zip
 *   POST /api/readme/stream-url
 *   POST /api/readme/stream-rerun
 *
 * Returns:
 *   streamingText  — partial README text accumulated so far (empty string when idle)
 *   isStreaming    — true while the SSE connection is open
 *   startZip       — start a ZIP-based generation
 *   startUrl       — start a GitHub URL-based generation
 *   startRerun     — re-run from a stored generation id
 *   abort          — cancel the in-flight stream
 */

import { useCallback, useRef, useState } from "react";

export interface GenerationResult {
  id: number;
  projectName: string;
  stack: string[];
  scripts: string[];
  envVars: string[];
  deployment: string[];
  dependenciesCount: number;
  fileCount: number;
  readme: string;
  source: string;
  sourceLabel: string;
  model: string;
  modelLabel?: string;
  templateName?: string;
  hasReference?: number;
  createdAt: string;
}

interface ZipParams {
  fileBase64: string;
  fileName: string;
  modelId?: string;
  referenceReadme?: string;
  templateName?: string;
  includeBanner?: boolean;
}

interface UrlParams {
  url: string;
  modelId?: string;
  referenceReadme?: string;
  templateName?: string;
  includeBanner?: boolean;
}

interface RerunParams {
  id: number;
  modelId?: string;
  referenceReadme?: string;
  includeBanner?: boolean;
}

type StreamCallbacks = {
  onToken?: (text: string) => void;
  onDone?: (generation: GenerationResult) => void;
  onError?: (message: string) => void;
};

export function useStreamGenerate() {
  const [streamingText, setStreamingText] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const abort = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setIsStreaming(false);
  }, []);

  const runStream = useCallback(
    async (endpoint: string, body: object, callbacks: StreamCallbacks) => {
      // Cancel any in-flight stream
      abortRef.current?.abort();
      const ctrl = new AbortController();
      abortRef.current = ctrl;

      setStreamingText("");
      setIsStreaming(true);

      try {
        const res = await fetch(endpoint, {
          method: "POST",
          headers: { "content-type": "application/json" },
          credentials: "include",
          body: JSON.stringify(body),
          signal: ctrl.signal,
        });

        if (!res.ok) {
          const errText = await res.text();
          throw new Error(`HTTP ${res.status}: ${errText}`);
        }

        const reader = res.body?.getReader();
        if (!reader) throw new Error("No response body");

        const decoder = new TextDecoder();
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
              const event = JSON.parse(trimmed.slice(6));

              if (event.type === "token") {
                setStreamingText((prev) => prev + event.text);
                callbacks.onToken?.(event.text);
              } else if (event.type === "done") {
                callbacks.onDone?.(event.generation as GenerationResult);
              } else if (event.type === "error") {
                throw new Error(event.message || "Stream error");
              }
            } catch (parseErr: any) {
              // If it's our thrown Error, re-throw; otherwise skip malformed chunk
              if (parseErr?.message && !parseErr.message.startsWith("Unexpected token")) {
                throw parseErr;
              }
            }
          }
        }
      } catch (err: any) {
        if (err?.name !== "AbortError") {
          callbacks.onError?.(err?.message || "Generation failed");
        }
      } finally {
        setIsStreaming(false);
        abortRef.current = null;
      }
    },
    []
  );

  const startZip = useCallback(
    (params: ZipParams, callbacks: StreamCallbacks) =>
      runStream("/api/readme/stream-zip", params, callbacks),
    [runStream]
  );

  const startUrl = useCallback(
    (params: UrlParams, callbacks: StreamCallbacks) =>
      runStream("/api/readme/stream-url", params, callbacks),
    [runStream]
  );

  const startRerun = useCallback(
    (params: RerunParams, callbacks: StreamCallbacks) =>
      runStream("/api/readme/stream-rerun", params, callbacks),
    [runStream]
  );

  return { streamingText, isStreaming, startZip, startUrl, startRerun, abort };
}
