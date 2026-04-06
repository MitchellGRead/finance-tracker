import { db } from "../db";
import { lineItems, categories, users } from "../db/schema";
import type { ReportSnapshot } from "@finance-tracker/shared";

export function generateReportData(
  month: number,
  year: number
): ReportSnapshot {
  const prefix = `${year}-${String(month).padStart(2, "0")}`;

  // Fetch all data needed
  const allItems = db.select().from(lineItems).all();
  const periodItems = allItems.filter((item) => item.date.startsWith(prefix));
  const allUsers = db.select().from(users).all();
  const allCategories = db.select().from(categories).all();

  const getCategoryName = (id: number | null) =>
    id === null
      ? "Uncategorized"
      : allCategories.find((c) => c.id === id)?.name ?? "Unknown";

  const getUserName = (id: number) =>
    allUsers.find((u) => u.id === id)?.name ?? "Unknown";

  // Counts
  const lineItemCount = periodItems.length;
  const acceptedCount = periodItems.filter(
    (i) => i.status === "accepted"
  ).length;
  const rejectedCount = periodItems.filter(
    (i) => i.status === "rejected"
  ).length;

  // Only accepted items for financial calculations
  const accepted = periodItems.filter((i) => i.status === "accepted");

  const effectiveAmount = (item: (typeof accepted)[number]) =>
    item.isCredit ? -item.amount : item.amount;

  const isPersonal = (item: (typeof accepted)[number]) =>
    item.splitRatio === 1.0;

  // --- Category totals ---
  const catTotalsMap = new Map<
    number | null,
    { total: number; personal: number; shared: number }
  >();
  for (const item of accepted) {
    const key = item.categoryId;
    const ea = effectiveAmount(item);
    const entry = catTotalsMap.get(key) ?? { total: 0, personal: 0, shared: 0 };
    entry.total += ea;
    if (isPersonal(item)) {
      entry.personal += ea;
    } else {
      entry.shared += ea;
    }
    catTotalsMap.set(key, entry);
  }
  const categoryTotals = Array.from(catTotalsMap.entries())
    .map(([catId, { total, personal, shared }]) => ({
      categoryId: catId,
      categoryName: getCategoryName(catId),
      total: Math.round(total * 100) / 100,
      personalTotal: Math.round(personal * 100) / 100,
      sharedTotal: Math.round(shared * 100) / 100,
    }))
    .sort((a, b) => b.total - a.total);

  // --- User breakdowns ---
  const userBreakdowns = allUsers.map((user) => {
    const userItems = accepted.filter((i) => i.userId === user.id);
    const byCatMap = new Map<
      number | null,
      { total: number; personal: number; shared: number }
    >();
    for (const item of userItems) {
      const key = item.categoryId;
      const ea = effectiveAmount(item);
      const entry = byCatMap.get(key) ?? { total: 0, personal: 0, shared: 0 };
      entry.total += ea;
      if (isPersonal(item)) {
        entry.personal += ea;
      } else {
        entry.shared += ea;
      }
      byCatMap.set(key, entry);
    }
    const byCategory = Array.from(byCatMap.entries())
      .map(([catId, { total, personal, shared }]) => ({
        categoryId: catId,
        categoryName: getCategoryName(catId),
        total: Math.round(total * 100) / 100,
        personalTotal: Math.round(personal * 100) / 100,
        sharedTotal: Math.round(shared * 100) / 100,
      }))
      .sort((a, b) => b.total - a.total);

    const totalSpent =
      Math.round(
        userItems.reduce((sum, i) => sum + effectiveAmount(i), 0) * 100
      ) / 100;

    const personalSpending =
      Math.round(
        userItems
          .filter(isPersonal)
          .reduce((sum, i) => sum + effectiveAmount(i), 0) * 100
      ) / 100;

    const sharedSpending =
      Math.round(
        userItems
          .filter((i) => !isPersonal(i))
          .reduce((sum, i) => sum + effectiveAmount(i), 0) * 100
      ) / 100;

    // Effective total = personal spending + user's share of their shared items
    const effectiveTotal =
      Math.round(
        (personalSpending +
          userItems
            .filter((i) => !isPersonal(i))
            .reduce((sum, i) => sum + effectiveAmount(i) * i.splitRatio, 0)) *
          100
      ) / 100;

    return {
      userId: user.id,
      userName: user.name,
      totalSpent,
      personalSpending,
      sharedSpending,
      effectiveTotal,
      byCategory,
    };
  });

  // --- Split settlements ---
  // For each accepted item, the owner paid the full amount.
  // Their share is amount * splitRatio; the rest is owed back to them by others.
  // In a 2-person model: for item owned by A, B owes A: effectiveAmount * (1 - splitRatio)
  // Net across all items to produce settlements.
  const userIds = allUsers.map((u) => u.id);
  // balances[fromId][toId] = how much fromId owes toId
  const balances = new Map<string, number>();

  const balanceKey = (from: number, to: number) => `${from}->${to}`;

  for (const item of accepted) {
    const ownerId = item.userId;
    const ea = effectiveAmount(item);
    const otherShare = ea * (1 - item.splitRatio);

    // Split the other share evenly among all other users
    const otherUsers = userIds.filter((id) => id !== ownerId);
    if (otherUsers.length === 0) continue;
    const perOther = otherShare / otherUsers.length;

    for (const otherId of otherUsers) {
      const key = balanceKey(otherId, ownerId);
      balances.set(key, (balances.get(key) ?? 0) + perOther);
    }
  }

  // Net out pairwise balances
  const settlements: ReportSnapshot["splitSummary"]["settlements"] = [];
  const processed = new Set<string>();

  for (const a of userIds) {
    for (const b of userIds) {
      if (a >= b) continue;
      const pairKey = `${a}-${b}`;
      if (processed.has(pairKey)) continue;
      processed.add(pairKey);

      const aOwesB = balances.get(balanceKey(a, b)) ?? 0;
      const bOwesA = balances.get(balanceKey(b, a)) ?? 0;
      const net = aOwesB - bOwesA;

      if (Math.abs(net) < 0.01) continue;

      if (net > 0) {
        settlements.push({
          fromUserId: a,
          fromUserName: getUserName(a),
          toUserId: b,
          toUserName: getUserName(b),
          amount: Math.round(net * 100) / 100,
        });
      } else {
        settlements.push({
          fromUserId: b,
          fromUserName: getUserName(b),
          toUserId: a,
          toUserName: getUserName(a),
          amount: Math.round(Math.abs(net) * 100) / 100,
        });
      }
    }
  }

  return {
    periodMonth: month,
    periodYear: year,
    generatedAt: new Date().toISOString(),
    categoryTotals,
    userBreakdowns,
    splitSummary: { settlements },
    lineItemCount,
    acceptedCount,
    rejectedCount,
  };
}
