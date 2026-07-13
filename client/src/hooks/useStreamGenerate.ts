/**
 * useStreamGenerate
 *
 * Netlify Functions can't hold open SSE connections, so this calls the
 * existing non-streaming tRPC mutations (readme.generateZip / generateUrl /
 * rerun) instead of the old /api/readme/stream-* SSE routes. The external
 * interface (streamingText, isStreaming, startZip/startUrl/startRerun,
 * onToken/onDone/onError callbacks) is unchanged so callers don't need to
 * know the difference — `streamingText` just jumps straight to the full
 * README once the request resolves, rather than growing token by token.
 */

import { useCallback, useState } from "react";
import { trpc } from "@/lib/trpc";

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

export function useStreamGenerate() {
  const [streamingText, setStreamingText] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);

  const generateZip = trpc.readme.generateZip.useMutation();
  const generateUrl = trpc.readme.generateUrl.useMutation();
  const rerun = trpc.readme.rerun.useMutation();

  const abort = useCallback(() => {
    setIsStreaming(false);
  }, []);

  const run = useCallback(
    async <TInput>(
      mutateAsync: (input: TInput) => Promise<GenerationResult>,
      input: TInput,
      callbacks: StreamCallbacks
    ) => {
      setStreamingText("");
      setIsStreaming(true);
      try {
        const generation = await mutateAsync(input);
        setStreamingText(generation.readme);
        callbacks.onToken?.(generation.readme);
        callbacks.onDone?.(generation);
      } catch (err: any) {
        callbacks.onError?.(err?.message || "Generation failed");
      } finally {
        setIsStreaming(false);
      }
    },
    []
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
