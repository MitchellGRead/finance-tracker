import { int, real, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

const timestamps = {
  createdAt: text("created_at")
    .notNull()
    .default(sql`(datetime('now'))`),
  updatedAt: text("updated_at")
    .notNull()
    .default(sql`(datetime('now'))`)
    .$onUpdate(() => new Date().toISOString()),
};

export const users = sqliteTable("users", {
  id: int("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull().unique(),
  ...timestamps,
});

export const statements = sqliteTable("statements", {
  id: int("id").primaryKey({ autoIncrement: true }),
  userId: int("user_id")
    .notNull()
    .references(() => users.id),
  sourceType: text("source_type").notNull(), // 'amex' | 'td'
  fileName: text("file_name").notNull(),
  uploadedAt: text("uploaded_at")
    .notNull()
    .default(sql`(datetime('now'))`),
  periodMonth: int("period_month").notNull(),
  periodYear: int("period_year").notNull(),
  ...timestamps,
});

export const categories = sqliteTable("categories", {
  id: int("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull().unique(),
  defaultSplitRatio: real("default_split_ratio"),
  ...timestamps,
});

export const lineItems = sqliteTable("line_items", {
  id: int("id").primaryKey({ autoIncrement: true }),
  statementId: int("statement_id").references(() => statements.id),
  userId: int("user_id")
    .notNull()
    .references(() => users.id),
  date: text("date").notNull(),
  description: text("description").notNull(),
  amount: real("amount").notNull(),
  categoryId: int("category_id").references(() => categories.id),
  splitRatio: real("split_ratio").notNull().default(0.5),
  status: text("status").notNull().default("pending"), // 'pending' | 'accepted' | 'rejected'
  statusOverride: int("status_override", { mode: "boolean" })
    .notNull()
    .default(false),
  categoryOverride: int("category_override", { mode: "boolean" })
    .notNull()
    .default(false),
  splitRatioOverride: int("split_ratio_override", { mode: "boolean" })
    .notNull()
    .default(false),
  note: text("note"),
  isManual: int("is_manual", { mode: "boolean" }).notNull().default(false),
  isCredit: int("is_credit", { mode: "boolean" }).notNull().default(false),
  ...timestamps,
});

export const categoryRules = sqliteTable("category_rules", {
  id: int("id").primaryKey({ autoIncrement: true }),
  pattern: text("pattern").notNull(),
  categoryId: int("category_id")
    .notNull()
    .references(() => categories.id),
  createdByUserId: int("created_by_user_id")
    .notNull()
    .references(() => users.id),
  ...timestamps,
});

export const acceptRejectRules = sqliteTable("accept_reject_rules", {
  id: int("id").primaryKey({ autoIncrement: true }),
  userId: int("user_id")
    .notNull()
    .references(() => users.id),
  pattern: text("pattern").notNull(),
  action: text("action").notNull(), // 'accept' | 'reject'
  ...timestamps,
});

export const reportSnapshots = sqliteTable("report_snapshots", {
  id: int("id").primaryKey({ autoIncrement: true }),
  periodMonth: int("period_month").notNull(),
  periodYear: int("period_year").notNull(),
  generatedAt: text("generated_at")
    .notNull()
    .default(sql`(datetime('now'))`),
  data: text("data").notNull(), // JSON blob
  ...timestamps,
});
