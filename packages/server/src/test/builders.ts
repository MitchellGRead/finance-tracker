import { lineItems, users, categories } from "../db/schema";

/** Row builders for service tests that run on plain objects, not the DB. */

export type LineItemRow = typeof lineItems.$inferSelect;
export type UserRow = typeof users.$inferSelect;
export type CategoryRow = typeof categories.$inferSelect;

const TS = "2026-04-01T00:00:00.000Z";

export const user = (id: number, name: string): UserRow => ({ id, name, createdAt: TS, updatedAt: TS });

export const category = (id: number, name: string): CategoryRow => ({
  id,
  name,
  defaultSplitRatio: null,
  createdAt: TS,
  updatedAt: TS,
});

let nextId = 1;
export const lineItem = (o: Partial<LineItemRow> & Pick<LineItemRow, "date" | "amount" | "userId">): LineItemRow => ({
  id: nextId++,
  statementId: null,
  description: "item",
  categoryId: null,
  splitRatio: 0.5,
  status: "accepted",
  statusOverride: false,
  categoryOverride: false,
  splitRatioOverride: false,
  note: null,
  isManual: false,
  isCredit: false,
  fingerprint: null,
  suggestedCategoryId: null,
  suggestedCategoryConfidence: null,
  suggestedSplitRatio: null,
  suggestedSplitConfidence: null,
  suggestionStatus: null,
  suggestionModel: null,
  suggestedAt: null,
  createdAt: TS,
  updatedAt: TS,
  ...o,
});
