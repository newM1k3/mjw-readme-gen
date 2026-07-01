import { boolean, int, json, mysqlEnum, mysqlTable, text, timestamp, tinyint, varchar } from "drizzle-orm/mysql-core";

export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

// README Generations — stores every generated README with full metadata for history, re-run, and compare
export const readmeGenerations = mysqlTable("readme_generations", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  projectName: varchar("projectName", { length: 255 }).notNull().default(""),
  stack: json("stack").$type<string[]>().notNull(),
  dependenciesCount: int("dependenciesCount").notNull().default(0),
  scripts: json("scripts").$type<string[]>().notNull(),
  envVars: json("envVars").$type<string[]>().notNull(),
  deployment: json("deployment").$type<string[]>().notNull(),
  fileCount: int("fileCount").notNull().default(0),
  readme: text("readme").notNull(),
  source: varchar("source", { length: 32 }).notNull().default("zip"),
  sourceLabel: varchar("sourceLabel", { length: 512 }).notNull().default(""),
  model: varchar("model", { length: 64 }).notNull().default("claude"),
  modelLabel: varchar("modelLabel", { length: 128 }).notNull().default(""),
  templateName: varchar("templateName", { length: 80 }).notNull().default(""),
  hasReference: tinyint("hasReference").notNull().default(0),
  context: text("context"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type ReadmeGeneration = typeof readmeGenerations.$inferSelect;
export type InsertReadmeGeneration = typeof readmeGenerations.$inferInsert;

// README Templates — reusable named style references saved by the user
export const readmeTemplates = mysqlTable("readme_templates", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  name: varchar("name", { length: 80 }).notNull(),
  content: text("content").notNull(),
  charCount: int("charCount").notNull().default(0),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type ReadmeTemplate = typeof readmeTemplates.$inferSelect;
export type InsertReadmeTemplate = typeof readmeTemplates.$inferInsert;
