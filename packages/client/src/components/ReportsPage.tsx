import { useState } from "react";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "./ui/table";
import { Badge } from "./ui/badge";
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
  const [selectedPeriod, setSelectedPeriod] = useState<string>("");

  const reportsListQuery = useQuery(trpc.reports.list.queryOptions());
  const reports = reportsListQuery.data ?? [];

  // Parse selected period
  const [selectedMonth, selectedYear] = selectedPeriod
    ? selectedPeriod.split("-").map(Number)
    : [reports[0]?.periodMonth, reports[0]?.periodYear];

  const reportQuery = useQuery(
    trpc.reports.get.queryOptions(
      { month: selectedMonth!, year: selectedYear! },
      { enabled: selectedMonth !== undefined && selectedYear !== undefined }
    )
  );

  const snapshot: ReportSnapshot | null = reportQuery.data?.parsed ?? null;

  // Load prior snapshots for trend comparison
  const priorReports = reports.filter(
    (r) =>
      r.periodYear < (selectedYear ?? 0) ||
      (r.periodYear === selectedYear && r.periodMonth < (selectedMonth ?? 0))
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

  if (reports.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground">
        No reports generated yet. Go to the Workspace and click "Generate
        Report" for a month.
      </div>
    );
  }

  const totalSpending =
    snapshot?.categoryTotals.reduce((sum, c) => sum + c.total, 0) ?? 0;

  const settlement = snapshot?.splitSummary.settlements[0];

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Month selector */}
      <div className="flex items-center gap-3">
        <span className="text-sm font-medium text-foreground">Report for:</span>
        <Select
          value={selectedPeriod || `${reports[0]?.periodMonth}-${reports[0]?.periodYear}`}
          onValueChange={(v) => { if (v) setSelectedPeriod(v); }}
        >
          <SelectTrigger className="w-[200px] h-8 text-sm">
            <SelectValue placeholder="Select month" />
          </SelectTrigger>
          <SelectContent>
            {reports.map((r) => (
              <SelectItem
                key={r.id}
                value={`${r.periodMonth}-${r.periodYear}`}
              >
                {formatMonth(r.periodMonth, r.periodYear)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {snapshot && (
          <span className="text-xs text-muted-foreground">
            Generated{" "}
            {new Date(snapshot.generatedAt).toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
              hour: "numeric",
              minute: "2-digit",
            })}
          </span>
        )}
      </div>

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
                  <Badge variant="default">{snapshot.acceptedCount} accepted</Badge>
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
                    <TableHead className="text-right w-[80px]">%</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {snapshot.categoryTotals.map((cat) => (
                    <TableRow key={cat.categoryId ?? "null"}>
                      <TableCell className="text-sm font-medium">
                        {cat.categoryName}
                      </TableCell>
                      <TableCell className="text-right text-sm tabular-nums">
                        {formatCurrency(cat.total)}
                      </TableCell>
                      <TableCell className="text-right text-sm tabular-nums text-muted-foreground">
                        {totalSpending > 0
                          ? Math.round((cat.total / totalSpending) * 100)
                          : 0}
                        %
                      </TableCell>
                    </TableRow>
                  ))}
                  {snapshot.categoryTotals.length > 0 && (
                    <TableRow className="font-semibold border-t-2">
                      <TableCell>Total</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatCurrency(totalSpending)}
                      </TableCell>
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
            {snapshot.userBreakdowns.map((user) => (
              <Card key={user.userId}>
                <CardHeader>
                  <CardTitle className="text-base">{user.userName}</CardTitle>
                  <CardDescription>
                    Total: {formatCurrency(user.totalSpent)}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Category</TableHead>
                        <TableHead className="text-right">Amount</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {user.byCategory.map((cat) => (
                        <TableRow key={cat.categoryId ?? "null"}>
                          <TableCell className="text-sm">
                            {cat.categoryName}
                          </TableCell>
                          <TableCell className="text-right text-sm tabular-nums">
                            {formatCurrency(cat.total)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Settlement summary */}
          {snapshot.splitSummary.settlements.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Settlement Summary</CardTitle>
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
  );
}

function TrendSection({
  currentSnapshot,
  priorSnapshots,
}: {
  currentSnapshot: ReportSnapshot;
  priorSnapshots: Array<{ period: string; data: ReportSnapshot }>;
}) {
  if (priorSnapshots.length === 0) return null;

  const currentTotal = currentSnapshot.categoryTotals.reduce(
    (sum, c) => sum + c.total,
    0
  );
  const currentSettlement =
    currentSnapshot.splitSummary.settlements[0]?.amount ?? 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Trends</CardTitle>
        <CardDescription>Comparison with prior months</CardDescription>
      </CardHeader>
      <CardContent>
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

              return (
                <TableRow key={prior.period}>
                  <TableCell>{prior.period}</TableCell>
                  <TableCell className="text-right tabular-nums">
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
                  <TableCell className="text-right tabular-nums">
                    {formatCurrency(priorSettlement)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {prior.data.acceptedCount}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
