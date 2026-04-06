import { useState } from "react";
import { useTRPC } from "./lib/trpc";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "./components/ui/button";
import { useMonthPicker } from "./hooks/useMonthPicker";
import { ImportPanel } from "./components/ImportPanel";
import { UserManager } from "./components/UserManager";
import { CategoryRulesPanel } from "./components/CategoryRulesPanel";
import { AcceptRejectRulesPanel } from "./components/AcceptRejectRulesPanel";
import { MonthCalendar } from "./components/MonthCalendar";
import { LineItemsTable } from "./components/LineItemsTable";
import { AddLineItem } from "./components/AddLineItem";
import { AddRent } from "./components/AddRent";
import { ReportsPage } from "./components/ReportsPage";

type Page = "workspace" | "reports";

export function App() {
  const { month, year, label, setMonthAndYear } = useMonthPicker();
  const [page, setPage] = useState<Page>("workspace");
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  const reapplyMutation = useMutation(
    trpc.statements.reapplyRules.mutationOptions({
      onSuccess: (data) => {
        queryClient.invalidateQueries({
          queryKey: trpc.lineItems.list.queryKey(),
        });
        alert(
          `Rules re-applied: ${data.applied} matches, ${data.conflicts} conflicts`
        );
      },
    })
  );

  const clearMonthMutation = useMutation(
    trpc.lineItems.clearMonth.mutationOptions({
      onSuccess: (data) => {
        queryClient.invalidateQueries({
          queryKey: trpc.lineItems.list.queryKey(),
        });
        queryClient.invalidateQueries({
          queryKey: trpc.lineItems.countByMonth.queryKey(),
        });
        queryClient.invalidateQueries({
          queryKey: trpc.statements.list.queryKey(),
        });
        alert(`Cleared ${data.deleted} line items for ${label}`);
      },
    })
  );

  const generateMutation = useMutation(
    trpc.reports.generate.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries({
          queryKey: trpc.reports.list.queryKey(),
        });
        queryClient.invalidateQueries({
          queryKey: trpc.reports.get.queryKey(),
        });
        setPage("reports");
      },
    })
  );

  const handleClearMonth = () => {
    if (
      window.confirm(
        `Clear all line items for ${label}? This cannot be undone.`
      )
    ) {
      clearMonthMutation.mutate({ month, year });
    }
  };

  return (
    <div className="flex flex-col h-screen bg-background">
      {/* Top bar */}
      <header className="border-b bg-card px-6 py-3">
        <div className="mx-auto flex items-center justify-between">
          <div className="flex items-center gap-4">
            <h1 className="text-lg font-bold text-foreground">
              Finance Tracker
            </h1>
            <div className="flex gap-1">
              <Button
                variant={page === "workspace" ? "default" : "ghost"}
                size="sm"
                className="h-7 text-xs"
                onClick={() => setPage("workspace")}
              >
                Workspace
              </Button>
              <Button
                variant={page === "reports" ? "default" : "ghost"}
                size="sm"
                className="h-7 text-xs"
                onClick={() => setPage("reports")}
              >
                Reports
              </Button>
            </div>
          </div>

          <span className="text-sm font-medium text-foreground">{label}</span>

          <div className="flex items-center gap-2">
            {page === "workspace" && (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 text-sm"
                  onClick={() => generateMutation.mutate({ month, year })}
                  disabled={generateMutation.isPending}
                >
                  {generateMutation.isPending
                    ? "Generating..."
                    : "Generate Report"}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 text-sm"
                  onClick={() => reapplyMutation.mutate({ month, year })}
                  disabled={reapplyMutation.isPending}
                >
                  {reapplyMutation.isPending ? "Applying..." : "Re-apply Rules"}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 text-sm text-destructive hover:text-destructive"
                  onClick={handleClearMonth}
                  disabled={clearMonthMutation.isPending}
                >
                  Clear Month
                </Button>
                <AddLineItem month={month} year={year} />
                <AddRent month={month} year={year} />
              </>
            )}
          </div>
        </div>
      </header>

      {/* Main content */}
      {page === "workspace" ? (
        <div className="flex-1 min-h-0 px-6 py-4">
          <div className="flex gap-4 h-full">
            {/* Left panel — ~1/3 width */}
            <aside className="w-1/3 shrink-0 space-y-4">
              {/* Top row: Month, Users, Import */}
              <div className="grid grid-cols-3 gap-3">
                <MonthCalendar
                  month={month}
                  year={year}
                  onSelect={setMonthAndYear}
                />
                <UserManager />
                <ImportPanel month={month} year={year} />
              </div>
              {/* Rules panels */}
              <CategoryRulesPanel />
              <AcceptRejectRulesPanel />
            </aside>

            {/* Line items table — remaining ~2/3 */}
            <main className="flex-1 min-w-0 flex flex-col">
              <LineItemsTable month={month} year={year} />
            </main>
          </div>
        </div>
      ) : (
        <div className="flex-1 min-h-0 overflow-y-auto px-6 py-4">
          <ReportsPage />
        </div>
      )}
    </div>
  );
}
