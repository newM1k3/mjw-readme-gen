import type { GenerationJob } from "../utils/generationJob";
import { runGenerationJob } from "../utils/generationJob";
import { ENV } from "./env";

/**
 * Kicks off a generation job. A regular Netlify function's container freezes
 * as soon as it returns a response, so any async work started but not
 * awaited would simply stop — the LLM call has to run in a separate
 * "-background" function instead (up to 15 min budget), invoked here over
 * HTTP. A plain long-lived Node server has no such constraint, so there the
 * job just runs in-process without an extra hop.
 */
export async function triggerGenerationJob(job: GenerationJob): Promise<void> {
  if (process.env.NETLIFY) {
    const baseUrl = process.env.URL || process.env.DEPLOY_URL;
    if (!baseUrl) {
      throw new Error(
        "Netlify's URL/DEPLOY_URL env var isn't available — can't reach the background function"
      );
    }
    if (!ENV.internalFunctionSecret) {
      throw new Error("INTERNAL_FUNCTION_SECRET is not configured");
    }

    const resp = await fetch(`${baseUrl}/.netlify/functions/generate-background`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-internal-secret": ENV.internalFunctionSecret,
      },
      body: JSON.stringify(job),
    });

    if (!resp.ok) {
      throw new Error(`Failed to trigger background generation: ${resp.status}`);
    }
    return;
  }

  void runGenerationJob(job);
}
