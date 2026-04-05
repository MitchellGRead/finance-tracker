import { useTRPC } from "./lib/trpc";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "./components/ui/button";
import { useMonthPicker } from "./hooks/useMonthPicker";
import { ImportPanel } from "./components/ImportPanel";
import { UserManager } from "./components/UserManager";
import { CategoryManager } from "./components/CategoryManager";
import { CategoryRulesPanel } from "./components/CategoryRulesPanel";
import { AcceptRejectRulesPanel } from "./components/AcceptRejectRulesPanel";
import { MonthCalendar } from "./components/MonthCalendar";
import { LineItemsTable } from "./components/LineItemsTable";
import { AddLineItem } from "./components/AddLineItem";

export function App() {
  const { month, year, label, setMonth, setYear } = useMonthPicker();
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

  const handleClearMonth = () => {
    if (window.confirm(`Clear all line items for ${label}? This cannot be undone.`)) {
      clearMonthMutation.mutate({ month, year });
    }
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Top bar */}
      <header className="border-b bg-card px-6 py-3">
        <div className="mx-auto max-w-7xl flex items-center justify-between">
          <h1 className="text-lg font-bold text-foreground">
            Finance Tracker
          </h1>

          <span className="text-sm font-medium text-foreground">{label}</span>

          <div className="flex items-center gap-2">
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
          </div>
        </div>
      </header>

      {/* Main content */}
      <div className="mx-auto max-w-7xl px-6 py-4">
        <div className="flex gap-4">
          {/* Sidebar */}
          <aside className="w-[280px] shrink-0 space-y-4">
            <MonthCalendar
              month={month}
              year={year}
              onSelect={(m, y) => {
                setMonth(m);
                setYear(y);
              }}
              onYearChange={setYear}
            />
            <UserManager />
            <ImportPanel month={month} year={year} />
            <CategoryManager />
            <CategoryRulesPanel />
            <AcceptRejectRulesPanel />
          </aside>

          {/* Main area */}
          <main className="flex-1 min-w-0">
            <LineItemsTable month={month} year={year} />
          </main>
        </div>
      </div>
    </div>
  );
}
