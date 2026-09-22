export const SourceType = {
  AMEX: "amex",
  TD: "td",
} as const;
export type SourceType = (typeof SourceType)[keyof typeof SourceType];

export const LineItemStatus = {
  PENDING: "pending",
  ACCEPTED: "accepted",
  REJECTED: "rejected",
} as const;
export type LineItemStatus =
  (typeof LineItemStatus)[keyof typeof LineItemStatus];

export const RuleAction = {
  ACCEPT: "accept",
  REJECT: "reject",
} as const;
export type RuleAction = (typeof RuleAction)[keyof typeof RuleAction];

export const RuleType = {
  SPLIT: "split",
  PERSONAL: "personal",
} as const;
export type RuleType = (typeof RuleType)[keyof typeof RuleType];

export const SuggestionStatus = {
  /** Generated and awaiting the operator — renders as a ghost value. */
  SHADOW: "shadow",
  /** Materialized into the real columns when the line item was accepted. */
  CONFIRMED: "confirmed",
} as const;
export type SuggestionStatus =
  (typeof SuggestionStatus)[keyof typeof SuggestionStatus];
