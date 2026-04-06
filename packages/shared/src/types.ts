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
}
