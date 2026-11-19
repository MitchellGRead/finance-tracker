export interface ParsedLineItem {
  date: string;
  description: string;
  amount: number;
  isCredit: boolean;
}

export interface ReportSnapshot {
  periodMonth: number;
  periodYear: number;
  generatedAt: string;
  categoryTotals: Array<{
    categoryId: number | null;
    categoryName: string;
    total: number;
    personalTotal?: number;
    sharedTotal?: number;
  }>;
  userBreakdowns: Array<{
    userId: number;
    userName: string;
    totalSpent: number;
    personalSpending?: number;
    sharedSpending?: number;
    effectiveTotal?: number;
    byCategory: Array<{
      categoryId: number | null;
      categoryName: string;
      total: number;
      personalTotal?: number;
      sharedTotal?: number;
    }>;
  }>;
  splitSummary: {
    settlements: Array<{
      fromUserId: number;
      fromUserName: string;
      toUserId: number;
      toUserName: string;
      amount: number;
    }>;
  };
  lineItemCount: number;
  acceptedCount: number;
  rejectedCount: number;
  /**
   * Per line item id, the fields that move the numbers
   * (`status|categoryId|splitRatio|amount|isCredit|userId`), so the staleness
   * diff can say how many items changed. Absent on snapshots generated
   * before it existed.
   */
  itemStates?: Record<string, string>;
}
