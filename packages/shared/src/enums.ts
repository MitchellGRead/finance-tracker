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

export const AcceptRejectAction = {
  ACCEPT: "accept",
  REJECT: "reject",
} as const;
export type AcceptRejectAction =
  (typeof AcceptRejectAction)[keyof typeof AcceptRejectAction];
