import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { protectedProcedure, publicProcedure, router } from "./_core/trpc";
import {
  deleteGeneration,
  deleteTemplate,
  getGenerationById,
  getGenerationsByUser,
  getTemplatesByUser,
  saveGeneration,
  saveTemplate,
} from "./db";
import { storagePut, storageGet } from "./storage";
import { analyzeZip, buildContext } from "./utils/zipParser";
import { fetchRepoZip } from "./utils/githubFetch";
import { generateReadme, getAvailableModels } from "./utils/llmGenerator";

// ─── README Router ─────────────────────────────────────────────────────────

const readmeRouter = router({
  // List available LLM models
  listModels: publicProcedure.query(async () => {
    return getAvailableModels();
  }),

  // Generate README from a ZIP file (base64-encoded, stored via S3 first)
  generateZip: protectedProcedure
    .input(
      z.object({
        fileBase64: z.string(),
        fileName: z.string(),
        modelId: z.string().optional(),
        referenceReadme: z.string().optional(),
        templateName: z.string().optional(),
        includeBanner: z.boolean().default(true),
        projectNameOverride: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const buffer = Buffer.from(input.fileBase64, "base64");
      if (buffer.length > 100 * 1024 * 1024) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "ZIP file exceeds 100 MB limit." });
      }

      // Store in S3 before parsing
      const storageKey = `zips/${ctx.user.id}/${Date.now()}-${input.fileName}`;
      await storagePut(storageKey, buffer, "application/zip");

      // Parse the ZIP
      const analysis = await analyzeZip(buffer);
      if (input.projectNameOverride?.trim()) {
        analysis.projectNameOverride = input.projectNameOverride.trim();
      }
      const context = buildContext(analysis);

      // Generate README via LLM
      const readme = await generateReadme({
        context,
        modelId: input.modelId,
        referenceReadme: input.referenceReadme,
        includeBanner: input.includeBanner,
      });

      // Resolve model label
      const models = await getAvailableModels();
      const modelLabel = models.find((m) => m.id === input.modelId)?.label || input.modelId || "AI";

      // Use override name for DB record and response if provided
      const savedProjectName = analysis.projectNameOverride?.trim() || analysis.projectName;

      // Save to DB
      const id = await saveGeneration({
        userId: ctx.user.id,
        projectName: savedProjectName,
        stack: analysis.stack,
        dependenciesCount: Object.keys(analysis.dependencies).length,
        scripts: Object.keys(analysis.scripts),
        envVars: analysis.envVars,
        deployment: analysis.deployment,
        fileCount: analysis.fileCount,
        readme,
        source: "zip",
        sourceLabel: input.fileName,
        model: input.modelId || "default",
        modelLabel,
        templateName: input.templateName || "",
        hasReference: input.referenceReadme ? 1 : 0,
        context,
      });

      return {
        id,
        projectName: savedProjectName,
        stack: analysis.stack,
        dependenciesCount: Object.keys(analysis.dependencies).length,
        scripts: Object.keys(analysis.scripts),
        envVars: analysis.envVars,
        deployment: analysis.deployment,
        fileCount: analysis.fileCount,
        readme,
        source: "zip" as const,
        sourceLabel: input.fileName,
        model: input.modelId || "default",
        modelLabel,
        templateName: input.templateName || "",
        hasReference: input.referenceReadme ? 1 : 0,
        createdAt: new Date().toISOString(),
      };
    }),

  // Generate README from a public GitHub URL
  generateUrl: protectedProcedure
    .input(
      z.object({
        url: z.string().url(),
        modelId: z.string().optional(),
        referenceReadme: z.string().optional(),
        templateName: z.string().optional(),
        includeBanner: z.boolean().default(true),
        projectNameOverride: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { buffer, repoName } = await fetchRepoZip(input.url);

      const analysis = await analyzeZip(buffer);
      // Fall back to the repo slug if auto-detection returned a generic name
      if (!analysis.projectName || analysis.projectName === "Project") {
        analysis.projectName = repoName;
      }
      // Apply manual override last so it always wins
      if (input.projectNameOverride?.trim()) {
        analysis.projectNameOverride = input.projectNameOverride.trim();
      }
      const context = buildContext(analysis);

      const readme = await generateReadme({
        context,
        modelId: input.modelId,
        referenceReadme: input.referenceReadme,
        includeBanner: input.includeBanner,
      });

      const models = await getAvailableModels();
      const modelLabel = models.find((m) => m.id === input.modelId)?.label || input.modelId || "AI";

      // Use override name for DB record and response if provided
      const savedProjectName = analysis.projectNameOverride?.trim() || analysis.projectName;

      const id = await saveGeneration({
        userId: ctx.user.id,
        projectName: savedProjectName,
        stack: analysis.stack,
        dependenciesCount: Object.keys(analysis.dependencies).length,
        scripts: Object.keys(analysis.scripts),
        envVars: analysis.envVars,
        deployment: analysis.deployment,
        fileCount: analysis.fileCount,
        readme,
        source: "github",
        sourceLabel: input.url,
        model: input.modelId || "default",
        modelLabel,
        templateName: input.templateName || "",
        hasReference: input.referenceReadme ? 1 : 0,
        context,
      });

      return {
        id,
        projectName: savedProjectName,
        stack: analysis.stack,
        dependenciesCount: Object.keys(analysis.dependencies).length,
        scripts: Object.keys(analysis.scripts),
        envVars: analysis.envVars,
        deployment: analysis.deployment,
        fileCount: analysis.fileCount,
        readme,
        source: "github" as const,
        sourceLabel: input.url,
        model: input.modelId || "default",
        modelLabel,
        templateName: input.templateName || "",
        hasReference: input.referenceReadme ? 1 : 0,
        createdAt: new Date().toISOString(),
      };
    }),

  // Re-run generation from stored context
  rerun: protectedProcedure
    .input(
      z.object({
        id: z.number(),
        modelId: z.string().optional(),
        referenceReadme: z.string().optional(),
        templateName: z.string().optional(),
        includeBanner: z.boolean().default(true),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const src = await getGenerationById(input.id, ctx.user.id);
      if (!src) throw new TRPCError({ code: "NOT_FOUND", message: "Generation not found." });
      if (!src.context) throw new TRPCError({ code: "BAD_REQUEST", message: "This generation cannot be re-run (no stored context)." });

      const readme = await generateReadme({
        context: src.context,
        modelId: input.modelId,
        referenceReadme: input.referenceReadme,
        includeBanner: input.includeBanner,
      });

      const models = await getAvailableModels();
      const modelLabel = models.find((m) => m.id === input.modelId)?.label || input.modelId || "AI";

      const newId = await saveGeneration({
        userId: ctx.user.id,
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
        model: input.modelId || src.model,
        modelLabel,
        templateName: input.templateName || "",
        hasReference: input.referenceReadme ? 1 : 0,
        context: src.context,
      });

      return {
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
        model: input.modelId || src.model,
        modelLabel,
        templateName: input.templateName || "",
        hasReference: input.referenceReadme ? 1 : 0,
        createdAt: new Date().toISOString(),
      };
    }),

  // List history
  history: protectedProcedure.query(async ({ ctx }) => {
    return getGenerationsByUser(ctx.user.id);
  }),

  // Get single history item
  historyItem: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ ctx, input }) => {
      const item = await getGenerationById(input.id, ctx.user.id);
      if (!item) throw new TRPCError({ code: "NOT_FOUND", message: "Generation not found." });
      return item;
    }),

  // Delete a generation
  deleteGeneration: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      await deleteGeneration(input.id, ctx.user.id);
      return { deleted: true };
    }),
});

// ─── Templates Router ──────────────────────────────────────────────────────

const templatesRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    return getTemplatesByUser(ctx.user.id);
  }),

  create: protectedProcedure
    .input(
      z.object({
        name: z.string().min(1).max(80),
        content: z.string().min(1).max(20000),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const id = await saveTemplate({
        userId: ctx.user.id,
        name: input.name.trim(),
        content: input.content.trim(),
        charCount: input.content.trim().length,
      });
      return { id, name: input.name.trim(), charCount: input.content.trim().length };
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      await deleteTemplate(input.id, ctx.user.id);
      return { deleted: true };
    }),
});

// ─── App Router ────────────────────────────────────────────────────────────

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query((opts) => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),
  readme: readmeRouter,
  templates: templatesRouter,
});

export type AppRouter = typeof appRouter;
