import { completeGeneration, failGeneration } from "../db";
import { generateReadme } from "./llmGenerator";

export type GenerationJob = {
  generationId: string;
  context: string;
  modelId?: string;
  referenceReadme?: string;
  includeBanner?: boolean;
};

/** Runs the actual (slow) LLM call and writes the result back to the
 * pending generation record. Shared by the plain Node server (runs inline)
 * and the Netlify background function (runs out-of-request). */
export async function runGenerationJob(job: GenerationJob): Promise<void> {
  try {
    const readme = await generateReadme({
      context: job.context,
      modelId: job.modelId,
      referenceReadme: job.referenceReadme,
      includeBanner: job.includeBanner,
    });
    await completeGeneration(job.generationId, readme);
  } catch (err: any) {
    console.error("[GenerationJob] failed", err);
    await failGeneration(job.generationId, err?.message || "Generation failed").catch((e: unknown) =>
      console.error("[GenerationJob] failed to record failure", e)
    );
  }
}
