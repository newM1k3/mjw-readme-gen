import serverless from "serverless-http";
import { createApp } from "../../server/_core/app";

// Wraps the Express app (tRPC API + OAuth + storage proxy) as a single
// Netlify Function. netlify.toml redirects /api/* here. Note: README
// generation is a synchronous request/response (no SSE) — see
// client/src/hooks/useStreamGenerate.ts — because Netlify Functions can't
// hold a streaming connection open. If generations start timing out on
// Netlify's function limit, switch to a background function + polling
// (Netlify Blobs) pattern instead of raising this further.
const app = createApp();

export const handler = serverless(app);
