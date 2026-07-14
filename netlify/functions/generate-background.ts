import { runGenerationJob } from "../../server/utils/generationJob";
import { ENV } from "../../server/_core/env";

// Filename must end in "-background" — that suffix is how Netlify recognizes
// a function as a background function (up to 15 min run time, invoked
// fire-and-forget: the caller gets a 202 immediately and this keeps running).
// Only server/_core/triggerGenerationJob.ts should ever call this endpoint —
// the shared secret keeps randoms from running up Anthropic usage on it.
export const handler = async (event: { headers: Record<string, string | undefined>; body: string | null }) => {
  const providedSecret = event.headers["x-internal-secret"] || event.headers["X-Internal-Secret"];
  if (!ENV.internalFunctionSecret || providedSecret !== ENV.internalFunctionSecret) {
    return { statusCode: 401, body: "Unauthorized" };
  }

  let job;
  try {
    job = JSON.parse(event.body || "{}");
  } catch {
    return { statusCode: 400, body: "Invalid JSON" };
  }

  if (!job.generationId || !job.context) {
    return { statusCode: 400, body: "generationId and context are required" };
  }

  await runGenerationJob(job);

  return { statusCode: 200, body: "ok" };
};
