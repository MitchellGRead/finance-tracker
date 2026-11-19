/**
 * A request, from the Reports page, to open the workspace filtered: pending
 * items, uncategorized items, one category, or specific items (an anomaly).
 * `nonce` makes a repeat of the same request re-apply after the operator
 * changed the filters by hand.
 */
export interface WorkspaceFilter {
  status?: "pending" | "accepted" | "rejected";
  /** `uncategorized` or a category id, as the table's category filter takes. */
  category?: string;
  itemIds?: number[];
  /** Shown on the chip that clears an `itemIds` filter. */
  label?: string;
  nonce: number;
}

export type WorkspaceFilterRequest = Omit<WorkspaceFilter, "nonce">;
