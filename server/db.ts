import { desc, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { InsertUser, readmeGenerations, readmeTemplates, users } from "../drizzle/schema";
import type { InsertReadmeGeneration, InsertReadmeTemplate } from "../drizzle/schema";
import { ENV } from "./_core/env";

let _db: ReturnType<typeof drizzle> | null = null;

export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) throw new Error("User openId is required for upsert");
  const db = await getDb();
  if (!db) return;

  const values: InsertUser = { openId: user.openId };
  const updateSet: Record<string, unknown> = {};

  const textFields = ["name", "email", "loginMethod"] as const;
  for (const field of textFields) {
    const value = user[field];
    if (value === undefined) continue;
    const normalized = value ?? null;
    values[field] = normalized;
    updateSet[field] = normalized;
  }

  if (user.lastSignedIn !== undefined) {
    values.lastSignedIn = user.lastSignedIn;
    updateSet.lastSignedIn = user.lastSignedIn;
  }
  if (user.role !== undefined) {
    values.role = user.role;
    updateSet.role = user.role;
  } else if (user.openId === ENV.ownerOpenId) {
    values.role = "admin";
    updateSet.role = "admin";
  }

  if (!values.lastSignedIn) values.lastSignedIn = new Date();
  if (Object.keys(updateSet).length === 0) updateSet.lastSignedIn = new Date();

  await db.insert(users).values(values).onDuplicateKeyUpdate({ set: updateSet });
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

// ─── README Generations ────────────────────────────────────────────────────

export async function saveGeneration(data: InsertReadmeGeneration) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(readmeGenerations).values(data);
  const insertId = (result as any)[0]?.insertId;
  return insertId as number;
}

export async function getGenerationsByUser(userId: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select({
      id: readmeGenerations.id,
      projectName: readmeGenerations.projectName,
      stack: readmeGenerations.stack,
      source: readmeGenerations.source,
      model: readmeGenerations.model,
      modelLabel: readmeGenerations.modelLabel,
      templateName: readmeGenerations.templateName,
      hasReference: readmeGenerations.hasReference,
      createdAt: readmeGenerations.createdAt,
    })
    .from(readmeGenerations)
    .where(eq(readmeGenerations.userId, userId))
    .orderBy(desc(readmeGenerations.createdAt))
    .limit(100);
}

export async function getGenerationById(id: number, userId: number) {
  const db = await getDb();
  if (!db) return null;
  const result = await db
    .select()
    .from(readmeGenerations)
    .where(eq(readmeGenerations.id, id))
    .limit(1);
  const row = result[0];
  if (!row || row.userId !== userId) return null;
  return row;
}

export async function deleteGeneration(id: number, userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const { and } = await import("drizzle-orm");
  await db
    .delete(readmeGenerations)
    .where(and(eq(readmeGenerations.id, id), eq(readmeGenerations.userId, userId)));
}

// ─── README Templates ──────────────────────────────────────────────────────

export async function saveTemplate(data: InsertReadmeTemplate) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(readmeTemplates).values(data);
  const insertId = (result as any)[0]?.insertId;
  return insertId as number;
}

export async function getTemplatesByUser(userId: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(readmeTemplates)
    .where(eq(readmeTemplates.userId, userId))
    .orderBy(desc(readmeTemplates.createdAt))
    .limit(200);
}

export async function deleteTemplate(id: number, userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const { and } = await import("drizzle-orm");
  await db
    .delete(readmeTemplates)
    .where(and(eq(readmeTemplates.id, id), eq(readmeTemplates.userId, userId)));
}
