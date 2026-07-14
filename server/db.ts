/**
 * server/db.ts
 *
 * Data-access layer — PocketBase edition.
 *
 * The server authenticates to PocketBase as a superuser on startup so it can
 * read/write across all users' records.  The browser never calls PocketBase
 * directly; all access goes through the existing tRPC API.
 *
 * Collections (all rules null = superuser-only):
 *   readme_users        — one record per GitHub login
 *   readme_generations  — one record per generated README
 *   readme_templates    — user-saved style references
 */

import PocketBase from "pocketbase";
import { ENV } from "./_core/env";

// ─── Canonical User type ────────────────────────────────────────────────────

export type User = {
  id: string;
  openId: string;
  name: string | null;
  email: string | null;
  loginMethod: string | null;
  role: "user" | "admin";
  lastSignedIn: string;
};

// ─── PocketBase client (singleton) ─────────────────────────────────────────

let _pb: PocketBase | null = null;

async function getPb(): Promise<PocketBase> {
  if (_pb && _pb.authStore.isValid) return _pb;

  const url = ENV.pocketbaseUrl;
  if (!url) throw new Error("POCKETBASE_URL is not set");

  _pb = new PocketBase(url);

  // Authenticate as superuser using email+password
  const adminEmail = ENV.pocketbaseAdminEmail;
  const adminPassword = ENV.pocketbaseAdminPassword;

  if (!adminEmail || !adminPassword) {
    throw new Error("POCKETBASE_ADMIN_EMAIL / POCKETBASE_ADMIN_PASSWORD are not set");
  }

  await _pb.collection("_superusers").authWithPassword(adminEmail, adminPassword);
  return _pb;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Map a raw PocketBase record to the canonical User shape. */
function toUser(record: any): User {
  return {
    id: record.id as string,
    openId: record.openId as string,
    name: (record.name as string) || null,
    email: (record.email as string) || null,
    loginMethod: (record.loginMethod as string) || null,
    role: (record.role as "user" | "admin") || "user",
    lastSignedIn: record.lastSignedIn as string,
  };
}

// ─── Users ──────────────────────────────────────────────────────────────────

export async function upsertUser(user: {
  openId: string;
  name?: string | null;
  email?: string | null;
  loginMethod?: string | null;
  role?: "user" | "admin";
  lastSignedIn?: Date | string;
}): Promise<void> {
  if (!user.openId) throw new Error("User openId is required for upsert");

  const pb = await getPb();

  // Determine role: admin if ownerOpenId matches
  const role =
    user.role !== undefined
      ? user.role
      : user.openId === ENV.ownerOpenId
      ? "admin"
      : undefined;

  const lastSignedIn =
    user.lastSignedIn instanceof Date
      ? user.lastSignedIn.toISOString()
      : user.lastSignedIn ?? new Date().toISOString();

  try {
    // Try to find existing record
    const existing = await pb
      .collection("readme_users")
      .getFirstListItem(`openId = "${user.openId}"`);

    // Build update payload — only include fields that were provided
    const updateData: Record<string, unknown> = { lastSignedIn };
    if (user.name !== undefined) updateData.name = user.name ?? "";
    if (user.email !== undefined) updateData.email = user.email ?? "";
    if (user.loginMethod !== undefined) updateData.loginMethod = user.loginMethod ?? "";
    if (role !== undefined) updateData.role = role;

    await pb.collection("readme_users").update(existing.id, updateData);
  } catch (err: any) {
    // 404 means not found — create a new record
    if (err?.status === 404 || err?.response?.code === 404) {
      const createData: Record<string, unknown> = {
        openId: user.openId,
        name: user.name ?? "",
        email: user.email ?? "",
        loginMethod: user.loginMethod ?? "",
        role: role ?? "user",
        lastSignedIn,
      };
      await pb.collection("readme_users").create(createData);
    } else {
      throw err;
    }
  }
}

export async function getUserByOpenId(openId: string): Promise<User | null> {
  const pb = await getPb();
  try {
    const record = await pb
      .collection("readme_users")
      .getFirstListItem(`openId = "${openId}"`);
    return toUser(record);
  } catch (err: any) {
    if (err?.status === 404 || err?.response?.code === 404) return null;
    throw err;
  }
}

// ─── README Generations ─────────────────────────────────────────────────────

export type InsertReadmeGeneration = {
  userId: string;
  projectName?: string;
  stack?: string[];
  dependenciesCount?: number;
  scripts?: string[];
  envVars?: string[];
  deployment?: string[];
  fileCount?: number;
  readme: string;
  source?: "zip" | "github" | string;
  sourceLabel?: string;
  model?: string;
  modelLabel?: string;
  templateName?: string;
  hasReference?: boolean | number;
  context?: string | null;
  /** Generation lifecycle status. Defaults to "complete" so old rows without the field read as done. */
  status?: "pending" | "complete" | "failed";
  /** Human-readable error detail when status === "failed". */
  errorMessage?: string | null;
};

export async function saveGeneration(data: InsertReadmeGeneration): Promise<string> {
  const pb = await getPb();
  const record = await pb.collection("readme_generations").create({
    user: data.userId,
    projectName: data.projectName ?? "",
    stack: data.stack ?? [],
    dependenciesCount: data.dependenciesCount ?? 0,
    scripts: data.scripts ?? [],
    envVars: data.envVars ?? [],
    deployment: data.deployment ?? [],
    fileCount: data.fileCount ?? 0,
    readme: data.readme,
    source: data.source ?? "zip",
    sourceLabel: data.sourceLabel ?? "",
    model: data.model ?? "claude-sonnet-5",
    modelLabel: data.modelLabel ?? "",
    templateName: data.templateName ?? "",
    hasReference: Boolean(data.hasReference),
    context: data.context ?? "",
    status: data.status ?? "complete",
    errorMessage: data.errorMessage ?? "",
  });
  return record.id as string;
}

/**
 * Creates a generation record before the README exists (`readme: ""`,
 * `status: "pending"`). Used by the background-generation flow: the LLM call
 * runs in a separate Netlify background function (up to 15 min budget)
 * because README generation routinely exceeds a regular function's timeout,
 * and the client polls this record via historyItem until it flips to
 * "complete"/"failed".
 */
export async function createPendingGeneration(
  data: Omit<InsertReadmeGeneration, "readme" | "status">
): Promise<string> {
  return saveGeneration({ ...data, readme: "", status: "pending" });
}

export async function completeGeneration(id: string, readme: string): Promise<void> {
  const pb = await getPb();
  await pb.collection("readme_generations").update(id, { readme, status: "complete" });
}

export async function failGeneration(id: string, errorMessage: string): Promise<void> {
  const pb = await getPb();
  await pb.collection("readme_generations").update(id, { status: "failed", errorMessage });
}

export async function getGenerationsByUser(userId: string) {
  const pb = await getPb();
  const result = await pb.collection("readme_generations").getList(1, 100, {
    filter: `user = "${userId}"`,
    sort: "-created",
    fields: "id,projectName,stack,source,model,modelLabel,templateName,hasReference,status,created",
  });
  return result.items.map((r) => ({
    id: r.id as string,
    projectName: r.projectName as string,
    stack: r.stack as string[],
    source: r.source as string,
    model: r.model as string,
    modelLabel: r.modelLabel as string,
    templateName: r.templateName as string,
    hasReference: r.hasReference as boolean,
    status: (r.status as "pending" | "complete" | "failed") || "complete",
    // Expose as `createdAt` to match the shape callers expect
    createdAt: new Date(r.created as string),
  }));
}

export async function getGenerationById(id: string, userId: string) {
  const pb = await getPb();
  try {
    const record = await pb.collection("readme_generations").getOne(id);
    // Ownership check
    if ((record.user as string) !== userId) return null;
    return {
      id: record.id as string,
      user: record.user as string,
      projectName: record.projectName as string,
      stack: record.stack as string[],
      dependenciesCount: record.dependenciesCount as number,
      scripts: record.scripts as string[],
      envVars: record.envVars as string[],
      deployment: record.deployment as string[],
      fileCount: record.fileCount as number,
      readme: record.readme as string,
      source: record.source as string,
      sourceLabel: record.sourceLabel as string,
      model: record.model as string,
      modelLabel: record.modelLabel as string,
      templateName: record.templateName as string,
      hasReference: record.hasReference as boolean,
      context: record.context as string | null,
      status: (record.status as "pending" | "complete" | "failed") || "complete",
      errorMessage: (record.errorMessage as string) || null,
      createdAt: new Date(record.created as string),
      updatedAt: new Date(record.updated as string),
    };
  } catch (err: any) {
    if (err?.status === 404 || err?.response?.code === 404) return null;
    throw err;
  }
}

export async function deleteGeneration(id: string, userId: string): Promise<void> {
  const pb = await getPb();
  // Fetch-then-check for ownership (PocketBase has no atomic filter-delete)
  const record = await pb.collection("readme_generations").getOne(id);
  if ((record.user as string) !== userId) {
    throw new Error("Forbidden: you do not own this generation");
  }
  await pb.collection("readme_generations").delete(id);
}

// ─── README Templates ────────────────────────────────────────────────────────

export type InsertReadmeTemplate = {
  userId: string;
  name: string;
  content: string;
  charCount?: number;
};

export async function saveTemplate(data: InsertReadmeTemplate): Promise<string> {
  const pb = await getPb();
  const record = await pb.collection("readme_templates").create({
    user: data.userId,
    name: data.name,
    content: data.content,
    charCount: data.charCount ?? 0,
  });
  return record.id as string;
}

export async function getTemplatesByUser(userId: string) {
  const pb = await getPb();
  const result = await pb.collection("readme_templates").getList(1, 200, {
    filter: `user = "${userId}"`,
    sort: "-created",
  });
  return result.items.map((r) => ({
    id: r.id as string,
    user: r.user as string,
    name: r.name as string,
    content: r.content as string,
    charCount: r.charCount as number,
    createdAt: new Date(r.created as string),
    updatedAt: new Date(r.updated as string),
  }));
}

export async function deleteTemplate(id: string, userId: string): Promise<void> {
  const pb = await getPb();
  const record = await pb.collection("readme_templates").getOne(id);
  if ((record.user as string) !== userId) {
    throw new Error("Forbidden: you do not own this template");
  }
  await pb.collection("readme_templates").delete(id);
}
