/**
 * SSE streaming endpoints for README generation.
 *
 * POST /api/readme/stream-zip   — accepts JSON { fileBase64, fileName, modelId?, referenceReadme?, templateName?, includeBanner? }
 * POST /api/readme/stream-url   — accepts JSON { url, modelId?, referenceReadme?, templateName?, includeBanner? }
 * POST /api/readme/stream-rerun — accepts JSON { id, modelId?, referenceReadme?, includeBanner? }
 *
 * Each endpoint:
 *   1. Authenticates the session cookie.
 *   2. Parses / fetches the repository.
 *   3. Opens an SSE connection and streams LLM tokens to the client via streamReadme().
 *   4. On stream completion, saves the full README to the DB and emits a
 *      final `event: done` frame with the saved generation metadata.
 *   5. On client disconnect, aborts the upstream LLM fetch.
 *
 * SSE event format:
 *   data: {"type":"token","text":"..."}   — incremental token
 *   data: {"type":"done","generation":{…}} — final metadata (id, projectName, stack, …)
 *   data: {"type":"error","message":"…"}  — terminal error
 */

import type { Express, Request, Response } from "express";
import { sdk } from "../_core/sdk";
import { storagePut } from "../storage";
import { analyzeZip, buildContext } from "../utils/zipParser";
import { fetchRepoZip } from "../utils/githubFetch";
import { streamReadme, getAvailableModels } from "../utils/llmGenerator";
import { saveGeneration, getGenerationById } from "../db";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function sseWrite(res: Response, payload: object) {
  res.write(`data: ${JSON.stringify(payload)}\n\n`);
}

function setupSSE(res: Response) {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();
}

async function authenticateSSE(req: Request, res: Response) {
  try {
    return await sdk.authenticateRequest(req);
  } catch {
    res.status(401).json({ error: "Unauthorized" });
    return null;
  }
}

// ─── Route handlers ───────────────────────────────────────────────────────────

async function handleStreamZip(req: Request, res: Response) {
  const user = await authenticateSSE(req, res);
  if (!user) return;

  const { fileBase64, fileName, modelId, referenceReadme, templateName, includeBanner = true } = req.body;

  if (!fileBase64 || !fileName) {
    return res.status(400).json({ error: "fileBase64 and fileName are required" });
  }

  setupSSE(res);

  const abortCtrl = new AbortController();
  req.on("close", () => abortCtrl.abort());

  try {
    const buffer = Buffer.from(fileBase64, "base64");
    if (buffer.length > 100 * 1024 * 1024) {
      sseWrite(res, { type: "error", message: "ZIP file exceeds 100 MB limit." });
      return res.end();
    }

    // Store in S3 before parsing
    const storageKey = `zips/${user.id}/${Date.now()}-${fileName}`;
    await storagePut(storageKey, buffer, "application/zip");

    const analysis = await analyzeZip(buffer);
    const context = buildContext(analysis);

    const readme = await streamReadme({
      context,
      modelId,
      referenceReadme,
      includeBanner,
      signal: abortCtrl.signal,
      onToken: (delta) => sseWrite(res, { type: "token", text: delta }),
    });

    const models = await getAvailableModels();
    const modelLabel = models.find((m) => m.id === modelId)?.label || modelId || "AI";

    const id = await saveGeneration({
      userId: user.id,
      projectName: analysis.projectName,
      stack: analysis.stack,
      dependenciesCount: Object.keys(analysis.dependencies).length,
      scripts: Object.keys(analysis.scripts),
      envVars: analysis.envVars,
      deployment: analysis.deployment,
      fileCount: analysis.fileCount,
      readme,
      source: "zip",
      sourceLabel: fileName,
      model: modelId || "default",
      modelLabel,
      templateName: templateName || "",
      hasReference: referenceReadme ? 1 : 0,
      context,
    });

    sseWrite(res, {
      type: "done",
      generation: {
        id,
        projectName: analysis.projectName,
        stack: analysis.stack,
        dependenciesCount: Object.keys(analysis.dependencies).length,
        scripts: Object.keys(analysis.scripts),
        envVars: analysis.envVars,
        deployment: analysis.deployment,
        fileCount: analysis.fileCount,
        readme,
        source: "zip",
        sourceLabel: fileName,
        model: modelId || "default",
        modelLabel,
        templateName: templateName || "",
        hasReference: referenceReadme ? 1 : 0,
        createdAt: new Date().toISOString(),
      },
    });
  } catch (err: any) {
    if (err?.name !== "AbortError") {
      sseWrite(res, { type: "error", message: err?.message || "Generation failed" });
    }
  } finally {
    res.end();
  }
}

async function handleStreamUrl(req: Request, res: Response) {
  const user = await authenticateSSE(req, res);
  if (!user) return;

  const { url, modelId, referenceReadme, templateName, includeBanner = true } = req.body;

  if (!url) {
    return res.status(400).json({ error: "url is required" });
  }

  setupSSE(res);

  const abortCtrl = new AbortController();
  req.on("close", () => abortCtrl.abort());

  try {
    const { buffer, repoName } = await fetchRepoZip(url);
    const analysis = await analyzeZip(buffer);
    if (!analysis.projectName || analysis.projectName === "Project") {
      analysis.projectName = repoName;
    }
    const context = buildContext(analysis);

    const readme = await streamReadme({
      context,
      modelId,
      referenceReadme,
      includeBanner,
      signal: abortCtrl.signal,
      onToken: (delta) => sseWrite(res, { type: "token", text: delta }),
    });

    const models = await getAvailableModels();
    const modelLabel = models.find((m) => m.id === modelId)?.label || modelId || "AI";

    const id = await saveGeneration({
      userId: user.id,
      projectName: analysis.projectName,
      stack: analysis.stack,
      dependenciesCount: Object.keys(analysis.dependencies).length,
      scripts: Object.keys(analysis.scripts),
      envVars: analysis.envVars,
      deployment: analysis.deployment,
      fileCount: analysis.fileCount,
      readme,
      source: "github",
      sourceLabel: url,
      model: modelId || "default",
      modelLabel,
      templateName: templateName || "",
      hasReference: referenceReadme ? 1 : 0,
      context,
    });

    sseWrite(res, {
      type: "done",
      generation: {
        id,
        projectName: analysis.projectName,
        stack: analysis.stack,
        dependenciesCount: Object.keys(analysis.dependencies).length,
        scripts: Object.keys(analysis.scripts),
        envVars: analysis.envVars,
        deployment: analysis.deployment,
        fileCount: analysis.fileCount,
        readme,
        source: "github",
        sourceLabel: url,
        model: modelId || "default",
        modelLabel,
        templateName: templateName || "",
        hasReference: referenceReadme ? 1 : 0,
        createdAt: new Date().toISOString(),
      },
    });
  } catch (err: any) {
    if (err?.name !== "AbortError") {
      sseWrite(res, { type: "error", message: err?.message || "Generation failed" });
    }
  } finally {
    res.end();
  }
}

async function handleStreamRerun(req: Request, res: Response) {
  const user = await authenticateSSE(req, res);
  if (!user) return;

  const { id, modelId, referenceReadme, includeBanner = true } = req.body;

  if (!id) {
    return res.status(400).json({ error: "id is required" });
  }

  setupSSE(res);

  const abortCtrl = new AbortController();
  req.on("close", () => abortCtrl.abort());

  try {
    const src = await getGenerationById(Number(id), user.id);
    if (!src) {
      sseWrite(res, { type: "error", message: "Generation not found." });
      return res.end();
    }
    if (!src.context) {
      sseWrite(res, { type: "error", message: "This generation cannot be re-run (no stored context)." });
      return res.end();
    }

    const readme = await streamReadme({
      context: src.context,
      modelId,
      referenceReadme,
      includeBanner,
      signal: abortCtrl.signal,
      onToken: (delta) => sseWrite(res, { type: "token", text: delta }),
    });

    const models = await getAvailableModels();
    const modelLabel = models.find((m) => m.id === modelId)?.label || modelId || "AI";

    const newId = await saveGeneration({
      userId: user.id,
      projectName: src.projectName,
      stack: src.stack as string[],
      dependenciesCount: src.dependenciesCount,
      scripts: src.scripts as string[],
      envVars: src.envVars as string[],
      deployment: src.deployment as string[],
      fileCount: src.fileCount,
      readme,
      source: src.source,
      sourceLabel: src.sourceLabel,
      model: modelId || src.model,
      modelLabel,
      templateName: "",
      hasReference: referenceReadme ? 1 : 0,
      context: src.context,
    });

    sseWrite(res, {
      type: "done",
      generation: {
        id: newId,
        projectName: src.projectName,
        stack: src.stack as string[],
        dependenciesCount: src.dependenciesCount,
        scripts: src.scripts as string[],
        envVars: src.envVars as string[],
        deployment: src.deployment as string[],
        fileCount: src.fileCount,
        readme,
        source: src.source,
        sourceLabel: src.sourceLabel,
        model: modelId || src.model,
        modelLabel,
        templateName: "",
        hasReference: referenceReadme ? 1 : 0,
        createdAt: new Date().toISOString(),
      },
    });
  } catch (err: any) {
    if (err?.name !== "AbortError") {
      sseWrite(res, { type: "error", message: err?.message || "Re-run failed" });
    }
  } finally {
    res.end();
  }
}

// ─── Registration ─────────────────────────────────────────────────────────────

export function registerStreamRoutes(app: Express) {
  app.post("/api/readme/stream-zip", handleStreamZip);
  app.post("/api/readme/stream-url", handleStreamUrl);
  app.post("/api/readme/stream-rerun", handleStreamRerun);
}
