/**
 * useStreamGenerate
 *
 * README generation runs as a Netlify background function (up to 15 min
 * budget) instead of inline in the request — a regular function/serverless
 * request routinely times out before Claude finishes a full README. The
 * generateZip/generateUrl/rerun mutations return immediately with a
 * "pending" record; this hook polls readme.historyItem until it flips to
 * "complete"/"failed". The external interface (streamingText, isStreaming,
 * startZip/startUrl/startRerun, onToken/onDone/onError callbacks) is
 * unchanged from the old SSE-based version, so callers don't need to know
 * the difference — `streamingText` just jumps straight to the full README
 * once polling resolves, rather than growing token by token.
 */

import { useCallback, useRef, useState } from "react";
import { trpc } from "@/lib/trpc";

const POLL_INTERVAL_MS = 1500;

export interface GenerationResult {
  id: string;
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
  hasReference?: boolean;
  status?: "pending" | "complete" | "failed";
  errorMessage?: string | null;
  createdAt: string;
}

interface ZipParams {
  fileBase64: string;
  fileName: string;
  modelId?: string;
  referenceReadme?: string;
  templateName?: string;
  includeBanner?: boolean;
  projectNameOverride?: string;
}

interface UrlParams {
  url: string;
  modelId?: string;
  referenceReadme?: string;
  templateName?: string;
  includeBanner?: boolean;
  projectNameOverride?: string;
}

interface RerunParams {
  id: string;
  modelId?: string;
  referenceReadme?: string;
  includeBanner?: boolean;
}

type StreamCallbacks = {
  onToken?: (text: string) => void;
  onDone?: (generation: GenerationResult) => void;
  onError?: (message: string) => void;
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export function useStreamGenerate() {
  const [streamingText, setStreamingText] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const cancelledRef = useRef(false);

  const generateZip = trpc.readme.generateZip.useMutation();
  const generateUrl = trpc.readme.generateUrl.useMutation();
  const rerun = trpc.readme.rerun.useMutation();
  const utils = trpc.useUtils();

  const abort = useCallback(() => {
    cancelledRef.current = true;
    setIsStreaming(false);
  }, []);

  /** Polls readme.historyItem until the background job finishes. */
  const pollUntilDone = useCallback(
    async (id: string): Promise<GenerationResult> => {
      for (;;) {
        if (cancelledRef.current) throw new Error("Cancelled");

        const item = await utils.client.readme.historyItem.query({ id });

        if (item.status === "failed") {
          throw new Error(item.errorMessage || "Generation failed");
        }
        if (item.status !== "pending") {
          return item as unknown as GenerationResult;
        }

        await sleep(POLL_INTERVAL_MS);
      }
    },
    [utils]
  );

  const run = useCallback(
    async <TInput>(
      mutateAsync: (input: TInput) => Promise<GenerationResult>,
      input: TInput,
      callbacks: StreamCallbacks
    ) => {
      cancelledRef.current = false;
      setStreamingText("");
      setIsStreaming(true);
      try {
        const initial = await mutateAsync(input);
        const generation =
          initial.status === "pending" ? await pollUntilDone(initial.id) : initial;

        setStreamingText(generation.readme);
        callbacks.onToken?.(generation.readme);
        callbacks.onDone?.(generation);
      } catch (err: any) {
        if (!cancelledRef.current) {
          callbacks.onError?.(err?.message || "Generation failed");
        }
      } finally {
        setIsStreaming(false);
      }
    },
    [pollUntilDone]
  );

  const startZip = useCallback(
    (params: ZipParams, callbacks: StreamCallbacks) =>
      run((input: ZipParams) => generateZip.mutateAsync(input), params, callbacks),
    [run, generateZip]
  );

  const startUrl = useCallback(
    (params: UrlParams, callbacks: StreamCallbacks) =>
      run((input: UrlParams) => generateUrl.mutateAsync(input), params, callbacks),
    [run, generateUrl]
  );

  const startRerun = useCallback(
    (params: RerunParams, callbacks: StreamCallbacks) =>
      run((input: RerunParams) => rerun.mutateAsync(input), params, callbacks),
    [run, rerun]
  );

  return { streamingText, isStreaming, startZip, startUrl, startRerun, abort };
}
