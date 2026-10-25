import { useState } from "react";
import { useTRPC } from "./lib/trpc";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button, buttonVariants } from "./components/ui/button";
import { cn } from "./lib/utils";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "./components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "./components/ui/dropdown-menu";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "./components/ui/popover";
import {
  ChevronDown,
  MoreHorizontal,
} from "lucide-react";
import { useMonthPicker } from "./hooks/useMonthPicker";
import { ImportPanel } from "./components/ImportPanel";
import { StatementHistory } from "./components/StatementHistory";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "./components/ui/tabs";
import { UserManager } from "./components/UserManager";
import { RulesPanel } from "./components/RulesPanel";
import { MonthCalendar } from "./components/MonthCalendar";
import { LineItemsTable } from "./components/LineItemsTable";
import { AddLineItem } from "./components/AddLineItem";
import { AddRent } from "./components/AddRent";
import { ReportsPage } from "./components/ReportsPage";

type Page = "workspace" | "reports";

export function App() {
  const { month, year, label, setMonthAndYear } = useMonthPicker();
  const [page, setPage] = useState<Page>("workspace");
  const [monthPickerOpen, setMonthPickerOpen] = useState(false);
  const [usersOpen, setUsersOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  const rulesQuery = useQuery(trpc.rules.list.queryOptions());

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
        queryClient.invalidateQueries({
          queryKey: trpc.statements.history.queryKey(),
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
        <div className="mx-auto flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
          <div className="flex items-center gap-3">
            <h1 className="whitespace-nowrap text-base font-bold text-foreground">
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

          <Popover open={monthPickerOpen} onOpenChange={setMonthPickerOpen}>
            <PopoverTrigger
              className={cn(
                buttonVariants({ variant: "ghost", size: "sm" }),
                "h-7 gap-1 text-sm font-medium"
              )}
            >
              {label}
              <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
            </PopoverTrigger>
            <PopoverContent className="w-64">
              <MonthCalendar
                month={month}
                year={year}
                onSelect={(m, y) => {
                  setMonthAndYear(m, y);
                  // Year arrows also call onSelect; only a month click
                  // should dismiss the picker.
                  if (y === year) setMonthPickerOpen(false);
                }}
              />
            </PopoverContent>
          </Popover>

          <div className="ml-auto flex items-center gap-1.5">
            {page === "workspace" && (
              <>
                <Dialog open={importOpen} onOpenChange={setImportOpen}>
                  <DialogTrigger
                    className={cn(
                      buttonVariants({ size: "sm" }),
                      "h-8 text-sm"
                    )}
                  >
                    Import
                  </DialogTrigger>
                  {/* keepMounted so queued files and Jev's progress survive
                      closing the dialog mid-run. */}
                  <DialogContent keepMounted className="sm:max-w-3xl">
                    <DialogHeader>
                      <DialogTitle>Statements</DialogTitle>
                    </DialogHeader>
                    <Tabs defaultValue="import">
                      <TabsList>
                        <TabsTrigger value="import">Import</TabsTrigger>
                        <TabsTrigger value="history">History</TabsTrigger>
                      </TabsList>
                      <TabsContent value="import" keepMounted className="pt-2">
                        <ImportPanel />
                      </TabsContent>
                      <TabsContent value="history" className="pt-2">
                        <StatementHistory
                          onSelectMonth={(m, y) => {
                            setMonthAndYear(m, y);
                            setImportOpen(false);
                          }}
                        />
                      </TabsContent>
                    </Tabs>
                  </DialogContent>
                </Dialog>
                <Dialog>
                  <DialogTrigger
                    className={cn(
                      buttonVariants({ variant: "outline", size: "sm" }),
                      "h-8 gap-1.5 text-sm"
                    )}
                  >
                    Rules
                    <span className="text-xs text-muted-foreground">
                      {rulesQuery.data?.length ?? 0}
                    </span>
                  </DialogTrigger>
                  <DialogContent className="sm:max-w-2xl">
                    <DialogHeader>
                      <DialogTitle>Rules</DialogTitle>
                    </DialogHeader>
                    <RulesPanel />
                  </DialogContent>
                </Dialog>
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
                <AddLineItem month={month} year={year} />
                <AddRent month={month} year={year} />
                <DropdownMenu>
                  <DropdownMenuTrigger
                    className={cn(
                      buttonVariants({ variant: "outline", size: "sm" }),
                      "h-8 w-8 p-0"
                    )}
                    aria-label="More actions"
                  >
                    <MoreHorizontal className="h-4 w-4" />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-44">
                    <DropdownMenuItem onClick={() => setUsersOpen(true)}>
                      Manage users
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => reapplyMutation.mutate({ month, year })}
                      disabled={reapplyMutation.isPending}
                    >
                      {reapplyMutation.isPending
                        ? "Applying..."
                        : "Re-apply rules"}
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      variant="destructive"
                      onClick={handleClearMonth}
                      disabled={clearMonthMutation.isPending}
                    >
                      Clear {label}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
                <Dialog open={usersOpen} onOpenChange={setUsersOpen}>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Users</DialogTitle>
                    </DialogHeader>
                    <UserManager />
                  </DialogContent>
                </Dialog>
              </>
            )}
          </div>
        </div>
      </header>

      {/* Main content */}
      {page === "workspace" ? (
        <div className="flex-1 min-h-0 px-6 py-4">
          <main className="flex h-full min-w-0 flex-col">
            <LineItemsTable month={month} year={year} />
          </main>
        </div>
      ) : (
        <div className="flex-1 min-h-0 overflow-y-auto px-6 py-4">
          <ReportsPage />
        </div>
      )}
    </div>
  );
}
