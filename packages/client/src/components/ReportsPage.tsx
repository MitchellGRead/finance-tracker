import { Fragment, useState, useEffect } from "react";
import { useTRPC } from "../lib/trpc";
import { useQuery, useQueries } from "@tanstack/react-query";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "./ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "./ui/table";
import { Badge } from "./ui/badge";
import { MonthCalendar } from "./MonthCalendar";
import type { ReportSnapshot } from "@finance-tracker/shared";

const formatCurrency = (amount: number) =>
  new Intl.NumberFormat("en-CA", {
    style: "currency",
    currency: "CAD",
  }).format(amount);

const formatMonth = (month: number, year: number) =>
  new Date(year, month - 1).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });

export function ReportsPage() {
  const trpc = useTRPC();

  const reportsListQuery = useQuery(trpc.reports.list.queryOptions());
  const reports = reportsListQuery.data ?? [];

  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [initialized, setInitialized] = useState(false);

  // Once reports list loads, default to the most recent report's month
  useEffect(() => {
    if (!initialized && reports.length > 0) {
      setMonth(reports[0].periodMonth);
      setYear(reports[0].periodYear);
      setInitialized(true);
    }
  }, [reports, initialized]);

  const reportQuery = useQuery(
    trpc.reports.get.queryOptions({ month, year })
  );

  const snapshot: ReportSnapshot | null = reportQuery.data?.parsed ?? null;

  // Load prior snapshots for trend comparison
  const priorReports = reports.filter(
    (r) =>
      r.periodYear < year ||
      (r.periodYear === year && r.periodMonth < month)
  );

  const priorQueries = useQueries({
    queries: priorReports.map((r) =>
      trpc.reports.get.queryOptions({ month: r.periodMonth, year: r.periodYear })
    ),
  });

  const priorSnapshots = priorQueries
    .filter((q) => q.data?.parsed)
    .map((q) => ({
      period: formatMonth(q.data!.parsed.periodMonth, q.data!.parsed.periodYear),
      data: q.data!.parsed as ReportSnapshot,
    }));

  const totalSpending =
    snapshot?.categoryTotals.reduce((sum, c) => sum + c.total, 0) ?? 0;

  const hasPersonalData = snapshot?.categoryTotals.some(
    (c) => c.personalTotal != null && c.personalTotal > 0
  );
  const totalPersonal =
    snapshot?.categoryTotals.reduce(
      (sum, c) => sum + (c.personalTotal ?? 0),
      0
    ) ?? 0;
  const totalShared =
    snapshot?.categoryTotals.reduce(
      (sum, c) => sum + (c.sharedTotal ?? 0),
      0
    ) ?? 0;

  // Per-user personal amount indexed by (categoryKey, userId) for the category breakdown.
  const categoryKey = (id: number | null) => (id === null ? "null" : String(id));
  const personalByCategoryByUser = new Map<string, Map<number, number>>();
  for (const u of snapshot?.userBreakdowns ?? []) {
    for (const cat of u.byCategory) {
      const amount = cat.personalTotal ?? 0;
      if (amount <= 0) continue;
      const key = categoryKey(cat.categoryId);
      if (!personalByCategoryByUser.has(key)) {
        personalByCategoryByUser.set(key, new Map());
      }
      personalByCategoryByUser.get(key)!.set(u.userId, amount);
    }
  }
  const personalTotalByUser = new Map<number, number>(
    (snapshot?.userBreakdowns ?? []).map((u) => [
      u.userId,
      u.personalSpending ?? 0,
    ])
  );

  const settlement = snapshot?.splitSummary.settlements[0];

  return (
    <div className="flex gap-6">
      {/* Left: Month Calendar */}
      <div className="w-[260px] shrink-0">
        <MonthCalendar
          month={month}
          year={year}
          onSelect={(m, y) => {
            setMonth(m);
            setYear(y);
          }}
        />
        {snapshot && (
          <p className="mt-2 text-xs text-muted-foreground">
            Generated{" "}
            {new Date(snapshot.generatedAt).toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
              hour: "numeric",
              minute: "2-digit",
            })}
          </p>
        )}
      </div>

      {/* Right: Report content */}
      <div className="flex-1 min-w-0 space-y-6">
        {!snapshot && !reportQuery.isLoading && (
          <div className="flex items-center justify-center h-64 text-muted-foreground">
            No report generated for {formatMonth(month, year)}. Go to the
            Workspace and click "Generate Report".
          </div>
        )}

        {reportQuery.isLoading && (
          <div className="text-sm text-muted-foreground">Loading report...</div>
        )}

        {snapshot && (
          <>
            {/* Summary cards */}
            <div className="grid grid-cols-3 gap-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardDescription>Total Spending</CardDescription>
                  <CardTitle className="text-2xl">
                    {formatCurrency(totalSpending)}
                  </CardTitle>
                </CardHeader>
                {hasPersonalData && (
                  <CardContent>
                    <div className="flex gap-3 text-xs text-muted-foreground">
                      <span>Shared: {formatCurrency(totalShared)}</span>
                      <span>Personal: {formatCurrency(totalPersonal)}</span>
                    </div>
                  </CardContent>
                )}
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardDescription>Settlement</CardDescription>
                  <CardTitle className="text-2xl">
                    {settlement
                      ? formatCurrency(settlement.amount)
                      : "$0.00"}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {settlement ? (
                    <p className="text-sm text-muted-foreground">
                      {settlement.fromUserName} owes {settlement.toUserName}
                    </p>
                  ) : (
                    <p className="text-sm text-muted-foreground">All settled</p>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardDescription>Line Items</CardDescription>
                  <CardTitle className="text-2xl">
                    {snapshot.lineItemCount}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex gap-2 text-xs">
                    <Badge variant="default">
                      {snapshot.acceptedCount} accepted
                    </Badge>
                    <Badge variant="destructive">
                      {snapshot.rejectedCount} rejected
                    </Badge>
                    <Badge variant="secondary">
                      {snapshot.lineItemCount -
                        snapshot.acceptedCount -
                        snapshot.rejectedCount}{" "}
                      pending
                    </Badge>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Category breakdown */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Category Breakdown</CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Category</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                      {hasPersonalData && (
                        <>
                          <TableHead className="text-right">Shared</TableHead>
                          {snapshot.userBreakdowns.map((u) => (
                            <TableHead
                              key={u.userId}
                              className="text-right"
                            >
                              Personal ({u.userName})
                            </TableHead>
                          ))}
                        </>
                      )}
                      <TableHead className="text-right w-[80px]">%</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {snapshot.categoryTotals.map((cat) => {
                      const perUser = personalByCategoryByUser.get(
                        categoryKey(cat.categoryId)
                      );
                      return (
                        <TableRow key={cat.categoryId ?? "null"}>
                          <TableCell className="text-sm font-medium">
                            {cat.categoryName}
                          </TableCell>
                          <TableCell className="text-right text-sm tabular-nums">
                            {formatCurrency(cat.total)}
                          </TableCell>
                          {hasPersonalData && (
                            <>
                              <TableCell className="text-right text-sm tabular-nums text-muted-foreground">
                                {formatCurrency(cat.sharedTotal ?? 0)}
                              </TableCell>
                              {snapshot.userBreakdowns.map((u) => {
                                const amount = perUser?.get(u.userId) ?? 0;
                                return (
                                  <TableCell
                                    key={u.userId}
                                    className="text-right text-sm tabular-nums text-muted-foreground"
                                  >
                                    {amount > 0 ? formatCurrency(amount) : "—"}
                                  </TableCell>
                                );
                              })}
                            </>
                          )}
                          <TableCell className="text-right text-sm tabular-nums text-muted-foreground">
                            {totalSpending > 0
                              ? Math.round((cat.total / totalSpending) * 100)
                              : 0}
                            %
                          </TableCell>
                        </TableRow>
                      );
                    })}
                    {snapshot.categoryTotals.length > 0 && (
                      <TableRow className="font-semibold border-t-2">
                        <TableCell>Total</TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatCurrency(totalSpending)}
                        </TableCell>
                        {hasPersonalData && (
                          <>
                            <TableCell className="text-right tabular-nums text-muted-foreground">
                              {formatCurrency(totalShared)}
                            </TableCell>
                            {snapshot.userBreakdowns.map((u) => {
                              const amount = personalTotalByUser.get(u.userId) ?? 0;
                              return (
                                <TableCell
                                  key={u.userId}
                                  className="text-right tabular-nums text-muted-foreground"
                                >
                                  {amount > 0 ? formatCurrency(amount) : "—"}
                                </TableCell>
                              );
                            })}
                          </>
                        )}
                        <TableCell className="text-right tabular-nums">
                          100%
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            {/* Per-user breakdown */}
            <div className="grid grid-cols-2 gap-4">
              {snapshot.userBreakdowns.map((user) => {
                const userHasPersonal =
                  user.personalSpending != null && user.personalSpending > 0;
                return (
                  <Card key={user.userId}>
                    <CardHeader>
                      <CardTitle className="text-base">
                        {user.userName}
                      </CardTitle>
                      <CardDescription>
                        Total: {formatCurrency(user.totalSpent)}
                        {userHasPersonal && user.effectiveTotal != null && (
                          <span className="ml-2">
                            Effective: {formatCurrency(user.effectiveTotal)}
                          </span>
                        )}
                      </CardDescription>
                      {userHasPersonal && (
                        <div className="flex gap-3 text-xs text-muted-foreground mt-1">
                          <span>
                            Shared: {formatCurrency(user.sharedSpending ?? 0)}
                          </span>
                          <span>
                            Personal:{" "}
                            {formatCurrency(user.personalSpending ?? 0)}
                          </span>
                        </div>
                      )}
                    </CardHeader>
                    <CardContent>
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Category</TableHead>
                            <TableHead className="text-right">Total</TableHead>
                            <TableHead className="text-right">Shared</TableHead>
                            {userHasPersonal && (
                              <TableHead className="text-right">
                                Personal
                              </TableHead>
                            )}
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {user.byCategory.map((cat) => {
                            const shared = cat.sharedTotal ?? 0;
                            const personal = cat.personalTotal ?? 0;
                            return (
                              <TableRow key={cat.categoryId ?? "null"}>
                                <TableCell className="text-sm">
                                  {cat.categoryName}
                                </TableCell>
                                <TableCell className="text-right text-sm tabular-nums">
                                  {formatCurrency(cat.total)}
                                </TableCell>
                                <TableCell className="text-right text-sm tabular-nums text-muted-foreground">
                                  {shared > 0 ? formatCurrency(shared) : "—"}
                                </TableCell>
                                {userHasPersonal && (
                                  <TableCell className="text-right text-sm tabular-nums text-muted-foreground">
                                    {personal > 0
                                      ? formatCurrency(personal)
                                      : "—"}
                                  </TableCell>
                                )}
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    </CardContent>
                  </Card>
                );
              })}
            </div>

            {/* Settlement summary */}
            {snapshot.splitSummary.settlements.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">
                    Settlement Summary
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {snapshot.splitSummary.settlements.map((s, i) => (
                    <div key={i} className="flex items-center gap-2 text-sm">
                      <span className="font-medium">{s.fromUserName}</span>
                      <span className="text-muted-foreground">owes</span>
                      <span className="font-medium">{s.toUserName}</span>
                      <span className="font-semibold text-lg ml-2">
                        {formatCurrency(s.amount)}
                      </span>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}

            {/* Trend comparison */}
            {priorSnapshots.length > 0 && (
              <TrendSection
                currentSnapshot={snapshot}
                priorSnapshots={priorSnapshots}
              />
            )}
          </>
        )}
      </div>
    </div>
  );
}

function TrendSection({
  currentSnapshot,
  priorSnapshots,
}: {
  currentSnapshot: ReportSnapshot;
  priorSnapshots: Array<{ period: string; data: ReportSnapshot }>;
}) {
  const [expandedPeriod, setExpandedPeriod] = useState<string | null>(null);

  if (priorSnapshots.length === 0) return null;

  const currentTotal = currentSnapshot.categoryTotals.reduce(
    (sum, c) => sum + c.total,
    0
  );
  const currentSettlement =
    currentSnapshot.splitSummary.settlements[0]?.amount ?? 0;

  // Build a map of current category totals for comparison
  const currentCatMap = new Map(
    currentSnapshot.categoryTotals.map((c) => [c.categoryName, c.total])
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Trends</CardTitle>
        <CardDescription>
          Click a month row to see category breakdown comparison
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Month</TableHead>
              <TableHead className="text-right">Total Spending</TableHead>
              <TableHead className="text-right">Settlement</TableHead>
              <TableHead className="text-right">Items</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow className="font-semibold bg-muted/50">
              <TableCell>
                {formatMonth(
                  currentSnapshot.periodMonth,
                  currentSnapshot.periodYear
                )}{" "}
                (current)
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {formatCurrency(currentTotal)}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {formatCurrency(currentSettlement)}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {currentSnapshot.acceptedCount}
              </TableCell>
            </TableRow>
            {priorSnapshots.map((prior) => {
              const priorTotal = prior.data.categoryTotals.reduce(
                (sum, c) => sum + c.total,
                0
              );
              const priorSettlement =
                prior.data.splitSummary.settlements[0]?.amount ?? 0;
              const totalChange = currentTotal - priorTotal;
              const totalPct =
                priorTotal > 0
                  ? Math.round((totalChange / priorTotal) * 100)
                  : 0;
              const isExpanded = expandedPeriod === prior.period;

              const allCategoryNames = new Set([
                ...currentSnapshot.categoryTotals.map((c) => c.categoryName),
                ...prior.data.categoryTotals.map((c) => c.categoryName),
              ]);
              const priorCatMap = new Map(
                prior.data.categoryTotals.map((c) => [c.categoryName, c.total])
              );

              return (
                <Fragment key={prior.period}>
                  <TableRow
                    className="cursor-pointer hover:bg-muted/30"
                    onClick={() =>
                      setExpandedPeriod(isExpanded ? null : prior.period)
                    }
                  >
                    <TableCell className="text-sm">
                      <span className="mr-2 text-xs text-muted-foreground">
                        {isExpanded ? "▾" : "▸"}
                      </span>
                      {prior.period}
                    </TableCell>
                    <TableCell className="text-right text-sm tabular-nums">
                      {formatCurrency(priorTotal)}
                      {totalChange !== 0 && (
                        <span
                          className={`ml-2 text-xs ${totalChange > 0 ? "text-destructive" : "text-green-600"}`}
                        >
                          {totalChange > 0 ? "+" : ""}
                          {totalPct}%
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-right text-sm tabular-nums">
                      {formatCurrency(priorSettlement)}
                    </TableCell>
                    <TableCell className="text-right text-sm tabular-nums">
                      {prior.data.acceptedCount}
                    </TableCell>
                  </TableRow>
                  {isExpanded && (
                    <TableRow>
                      <TableCell colSpan={4} className="p-0">
                        <div className="border-t bg-muted/20 px-6 py-3">
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead className="text-xs">
                                  Category
                                </TableHead>
                                <TableHead className="text-xs text-right">
                                  Current
                                </TableHead>
                                <TableHead className="text-xs text-right">
                                  {prior.period}
                                </TableHead>
                                <TableHead className="text-xs text-right w-[80px]">
                                  Change
                                </TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {Array.from(allCategoryNames)
                                .map((name) => {
                                  const curr = currentCatMap.get(name) ?? 0;
                                  const prev = priorCatMap.get(name) ?? 0;
                                  const change = curr - prev;
                                  const pct =
                                    prev > 0
                                      ? Math.round((change / prev) * 100)
                                      : curr > 0
                                        ? 100
                                        : 0;
                                  return { name, curr, prev, change, pct };
                                })
                                .sort((a, b) => b.curr - a.curr)
                                .map((row) => (
                                  <TableRow key={row.name}>
                                    <TableCell className="text-xs">
                                      {row.name}
                                    </TableCell>
                                    <TableCell className="text-xs text-right tabular-nums">
                                      {formatCurrency(row.curr)}
                                    </TableCell>
                                    <TableCell className="text-xs text-right tabular-nums">
                                      {formatCurrency(row.prev)}
                                    </TableCell>
                                    <TableCell className="text-xs text-right tabular-nums">
                                      {row.change !== 0 && (
                                        <span
                                          className={
                                            row.change > 0
                                              ? "text-destructive"
                                              : "text-green-600"
                                          }
                                        >
                                          {row.change > 0 ? "+" : ""}
                                          {row.pct}%
                                        </span>
                                      )}
                                    </TableCell>
                                  </TableRow>
                                ))}
                            </TableBody>
                          </Table>
                        </div>
                      </TableCell>
                    </TableRow>
                  )}
                </Fragment>
              );
            })}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
