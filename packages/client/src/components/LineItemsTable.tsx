import { useState } from "react";
import { useTRPC } from "../lib/trpc";
import { useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
import { suggestPattern } from "../lib/patterns";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select";
import { CategoryPicker } from "./CategoryPicker";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "./ui/table";

interface LineItemsTableProps {
  month: number;
  year: number;
}

type StatusFilter = "all" | "pending" | "accepted" | "rejected";

interface MatchingRules {
  categoryRule: { pattern: string; categoryName: string | null } | null;
  statusRule: { pattern: string; action: string } | null;
}

function findMatchingRules(
  description: string,
  catRules: Array<{ pattern: string; categoryName: string | null }>,
  arRules: Array<{ pattern: string; action: string }>
): MatchingRules {
  const descLower = description.toLowerCase();

  // Find best category rule (longest match)
  let bestCat: (typeof catRules)[number] | null = null;
  let bestCatLen = 0;
  for (const rule of catRules) {
    if (
      descLower.includes(rule.pattern.toLowerCase()) &&
      rule.pattern.length > bestCatLen
    ) {
      bestCat = rule;
      bestCatLen = rule.pattern.length;
    }
  }

  // Find best status rule (global, longest match)
  let bestAR: (typeof arRules)[number] | null = null;
  let bestARLen = 0;
  for (const rule of arRules) {
    if (
      descLower.includes(rule.pattern.toLowerCase()) &&
      rule.pattern.length > bestARLen
    ) {
      bestAR = rule;
      bestARLen = rule.pattern.length;
    }
  }

  return {
    categoryRule: bestCat
      ? { pattern: bestCat.pattern, categoryName: bestCat.categoryName }
      : null,
    statusRule: bestAR
      ? { pattern: bestAR.pattern, action: bestAR.action }
      : null,
  };
}

function isRealOverride(item: {
  statusOverride: boolean;
  status: string;
  categoryOverride: boolean;
  categoryId: number | null;
  splitRatioOverride: boolean;
  splitRatio: number;
}): boolean {
  if (item.statusOverride && item.status !== "pending") return true;
  if (item.categoryOverride && item.categoryId !== null) return true;
  if (item.splitRatioOverride && Math.abs(item.splitRatio - 0.5) > 0.001)
    return true;
  return false;
}

export function LineItemsTable({ month, year }: LineItemsTableProps) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [userFilter, setUserFilter] = useState<string>("all");
  const [editingNote, setEditingNote] = useState<number | null>(null);
  const [noteValue, setNoteValue] = useState("");

  // Rule creation popover state
  const [ruleItemId, setRuleItemId] = useState<number | null>(null);
  const [rulePattern, setRulePattern] = useState("");

  const usersQuery = useQuery(trpc.users.list.queryOptions());
  const lineItemsQuery = useQuery(
    trpc.lineItems.list.queryOptions({ month, year })
  );
  const catRulesQuery = useQuery(trpc.categoryRules.list.queryOptions());
  const arRulesQuery = useQuery(trpc.acceptRejectRules.list.queryOptions());

  const invalidateAll = () => {
    queryClient.invalidateQueries({
      queryKey: trpc.lineItems.list.queryKey(),
    });
    queryClient.invalidateQueries({
      queryKey: trpc.lineItems.countByMonth.queryKey(),
    });
  };

  const updateMutation = useMutation(
    trpc.lineItems.update.mutationOptions({ onSuccess: invalidateAll })
  );
  const deleteMutation = useMutation(
    trpc.lineItems.delete.mutationOptions({ onSuccess: invalidateAll })
  );
  const bulkUpdateMutation = useMutation(
    trpc.lineItems.bulkUpdateStatus.mutationOptions({
      onSuccess: invalidateAll,
    })
  );
  const clearOverridesMutation = useMutation(
    trpc.lineItems.clearOverrides.mutationOptions({ onSuccess: invalidateAll })
  );
  const saveAsRuleMutation = useMutation(
    trpc.lineItems.acceptAndCreateRules.mutationOptions({
      onSuccess: () => {
        invalidateAll();
        queryClient.invalidateQueries({
          queryKey: trpc.categoryRules.list.queryKey(),
        });
        queryClient.invalidateQueries({
          queryKey: trpc.acceptRejectRules.list.queryKey(),
        });
        setRuleItemId(null);
      },
    })
  );

  const items = lineItemsQuery.data ?? [];
  const catRules = catRulesQuery.data ?? [];
  const arRules = arRulesQuery.data ?? [];

  const getUserName = (userId: number) =>
    usersQuery.data?.find((u) => u.id === userId)?.name ?? "Unknown";

  const filteredItems = items.filter((item) => {
    if (statusFilter !== "all" && item.status !== statusFilter) return false;
    if (userFilter !== "all" && getUserName(item.userId) !== userFilter)
      return false;
    return true;
  });

  const pendingIds = filteredItems
    .filter((item) => item.status === "pending")
    .map((item) => item.id);

  const overrideCount = items.filter((item) => isRealOverride(item)).length;

  const statusColor = (status: string) => {
    switch (status) {
      case "accepted":
        return "default" as const;
      case "rejected":
        return "destructive" as const;
      default:
        return "secondary" as const;
    }
  };

  const cycleStatus = (id: number, current: string) => {
    const next =
      current === "pending"
        ? "accepted"
        : current === "accepted"
          ? "rejected"
          : "pending";
    updateMutation.mutate({
      id,
      status: next as "pending" | "accepted" | "rejected",
      statusOverride: true,
    });
  };

  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat("en-CA", {
      style: "currency",
      currency: "CAD",
    }).format(amount);

  // Check if an item has been modified from defaults (and thus could become a rule)
  const isModifiedFromDefault = (item: (typeof items)[number]) =>
    item.status !== "pending" || item.categoryId !== null;

  const openRulePopover = (item: (typeof items)[number]) => {
    setRuleItemId(item.id);
    setRulePattern(suggestPattern(item.description));
  };

  const confirmSaveRule = (item: (typeof items)[number]) => {
    saveAsRuleMutation.mutate({
      lineItemId: item.id,
      pattern: rulePattern,
      userId: item.userId,
      categoryId: item.categoryId,
      status:
        item.status === "rejected"
          ? "rejected"
          : "accepted",
    });
  };

  return (
    <div className="flex flex-col flex-1 min-h-0 gap-3">
      {/* Filters and bulk actions */}
      <div className="flex items-center gap-3 flex-wrap">
        <Select
          value={statusFilter}
          onValueChange={(v) => {
            if (v) setStatusFilter(v as StatusFilter);
          }}
        >
          <SelectTrigger className="h-8 w-[140px] text-sm">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="accepted">Accepted</SelectItem>
            <SelectItem value="rejected">Rejected</SelectItem>
          </SelectContent>
        </Select>

        <Select
          value={userFilter}
          onValueChange={(v) => {
            if (v) setUserFilter(v);
          }}
        >
          <SelectTrigger className="h-8 w-[140px] text-sm">
            <SelectValue placeholder="User" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Users</SelectItem>
            {usersQuery.data?.map((user) => (
              <SelectItem key={user.id} value={user.name}>
                {user.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="ml-auto flex items-center gap-2 text-sm text-muted-foreground">
          <span>{filteredItems.length} items</span>
          {overrideCount > 0 && (
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs"
              onClick={() => clearOverridesMutation.mutate({ month, year })}
            >
              Clear overrides ({overrideCount})
            </Button>
          )}
          {pendingIds.length > 0 && (
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs"
              onClick={() =>
                bulkUpdateMutation.mutate({
                  ids: pendingIds,
                  status: "accepted",
                })
              }
            >
              Accept all pending ({pendingIds.length})
            </Button>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="rounded-md border flex-1 min-h-0 overflow-y-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[80px]">Status</TableHead>
              <TableHead className="w-[90px]">Date</TableHead>
              <TableHead>Description</TableHead>
              <TableHead className="w-[70px]">User</TableHead>
              <TableHead className="w-[100px] text-right">Amount</TableHead>
              <TableHead className="w-[140px]">Category</TableHead>
              <TableHead className="w-[80px] text-right">Split %</TableHead>
              <TableHead className="w-[160px]">Note</TableHead>
              <TableHead className="w-[100px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredItems.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={9}
                  className="text-center text-muted-foreground py-8"
                >
                  {lineItemsQuery.isLoading
                    ? "Loading..."
                    : "No line items for this period. Import a statement to get started."}
                </TableCell>
              </TableRow>
            ) : (
              filteredItems.map((item) => {
                const rules = findMatchingRules(
                  item.description,
                  catRules,
                  arRules
                );
                const hasCoverage =
                  rules.categoryRule !== null || rules.statusRule !== null;
                const showRuleButton =
                  !hasCoverage && isModifiedFromDefault(item);
                const isEditing = ruleItemId === item.id;
                const realOverride = isRealOverride(item);

                return (
                  <TableRow
                    key={item.id}
                    className={`${
                      item.status === "rejected" ? "opacity-50" : ""
                    } ${realOverride ? "border-l-2 border-l-blue-400" : ""}`}
                  >
                    {/* Status badge */}
                    <TableCell>
                      <Badge
                        variant={statusColor(item.status)}
                        className="cursor-pointer text-xs select-none"
                        onClick={() => cycleStatus(item.id, item.status)}
                      >
                        {item.status}
                      </Badge>
                    </TableCell>

                    {/* Date */}
                    <TableCell className="text-xs tabular-nums">
                      {item.date}
                    </TableCell>

                    {/* Description */}
                    <TableCell className="text-sm font-medium max-w-[300px] truncate">
                      {item.isCredit && (
                        <Badge
                          variant="outline"
                          className="mr-1.5 text-[10px] px-1 py-0"
                        >
                          CR
                        </Badge>
                      )}
                      {item.description}
                      {item.isManual ? (
                        <Badge
                          variant="outline"
                          className="ml-1.5 text-[10px] px-1 py-0"
                        >
                          Manual
                        </Badge>
                      ) : item.sourceType ? (
                        <Badge
                          variant="outline"
                          className="ml-1.5 text-[10px] px-1 py-0 text-muted-foreground"
                        >
                          {item.sourceType === "amex" ? "Amex" : "TD"}
                        </Badge>
                      ) : null}
                      {realOverride && (
                        <Badge
                          variant="outline"
                          className="ml-1.5 text-[10px] px-1 py-0 border-blue-400 text-blue-500"
                        >
                          Override
                        </Badge>
                      )}
                    </TableCell>

                    {/* User */}
                    <TableCell className="text-xs">
                      {getUserName(item.userId)}
                    </TableCell>

                    {/* Amount */}
                    <TableCell className="text-right text-sm tabular-nums">
                      {formatCurrency(item.isCredit ? -item.amount : item.amount)}
                    </TableCell>

                    {/* Category */}
                    <TableCell>
                      <CategoryPicker
                        currentCategoryName={item.categoryName}
                        onSelect={(catId) => {
                          updateMutation.mutate({
                            id: item.id,
                            categoryId: catId,
                            categoryOverride: true,
                          });
                        }}
                      />
                    </TableCell>

                    {/* Split ratio */}
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        {item.splitRatioOverride &&
                          Math.abs(item.splitRatio - 0.5) > 0.001 && (
                            <span
                              className="text-blue-500 text-[10px]"
                              title="Override"
                            >
                              *
                            </span>
                          )}
                        <Input
                          type="number"
                          min={0}
                          max={100}
                          value={Math.round(item.splitRatio * 100)}
                          onChange={(e) => {
                            const pct = parseInt(e.target.value);
                            if (!isNaN(pct) && pct >= 0 && pct <= 100) {
                              updateMutation.mutate({
                                id: item.id,
                                splitRatio: pct / 100,
                                splitRatioOverride: true,
                              });
                            }
                          }}
                          className="h-7 w-16 text-xs text-right px-1"
                        />
                      </div>
                    </TableCell>

                    {/* Note */}
                    <TableCell>
                      {editingNote === item.id ? (
                        <Input
                          value={noteValue}
                          onChange={(e) => setNoteValue(e.target.value)}
                          onBlur={() => {
                            updateMutation.mutate({
                              id: item.id,
                              note: noteValue || null,
                            });
                            setEditingNote(null);
                          }}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              updateMutation.mutate({
                                id: item.id,
                                note: noteValue || null,
                              });
                              setEditingNote(null);
                            }
                            if (e.key === "Escape") setEditingNote(null);
                          }}
                          className="h-7 text-xs px-1"
                          autoFocus
                        />
                      ) : (
                        <span
                          className="text-xs text-muted-foreground cursor-pointer hover:text-foreground truncate block max-w-[150px]"
                          onClick={() => {
                            setEditingNote(item.id);
                            setNoteValue(item.note ?? "");
                          }}
                        >
                          {item.note || "Add note..."}
                        </span>
                      )}
                    </TableCell>

                    {/* Actions */}
                    <TableCell>
                      <div className="flex items-center gap-1">
                        {/* Rule indicators for items covered by rules */}
                        {hasCoverage && (
                          <div className="flex gap-0.5">
                            {rules.statusRule && (
                              <Badge
                                variant="outline"
                                className="text-[9px] px-1 py-0 border-green-400 text-green-600"
                                title={`Status rule: "${rules.statusRule.pattern}" → ${rules.statusRule.action}`}
                              >
                                S
                              </Badge>
                            )}
                            {rules.categoryRule && (
                              <Badge
                                variant="outline"
                                className="text-[9px] px-1 py-0 border-purple-400 text-purple-600"
                                title={`Category rule: "${rules.categoryRule.pattern}" → ${rules.categoryRule.categoryName}`}
                              >
                                C
                              </Badge>
                            )}
                          </div>
                        )}

                        {/* Save as Rule button — only for items not covered by rules */}
                        {showRuleButton && !isEditing && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 px-1.5 text-[10px] text-muted-foreground hover:text-foreground"
                            title="Save as global rule"
                            onClick={() => openRulePopover(item)}
                          >
                            + Rule
                          </Button>
                        )}

                        {/* Inline rule editor */}
                        {isEditing && (
                          <div className="flex items-center gap-1">
                            <Input
                              value={rulePattern}
                              onChange={(e) => setRulePattern(e.target.value)}
                              className="h-6 text-[10px] w-28 px-1"
                              onKeyDown={(e) => {
                                if (e.key === "Enter") confirmSaveRule(item);
                                if (e.key === "Escape") setRuleItemId(null);
                              }}
                              autoFocus
                            />
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-6 px-1 text-[10px] text-green-600 hover:text-green-700"
                              onClick={() => confirmSaveRule(item)}
                              disabled={
                                !rulePattern.trim() ||
                                saveAsRuleMutation.isPending
                              }
                            >
                              Save
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-6 px-1 text-[10px]"
                              onClick={() => setRuleItemId(null)}
                            >
                              x
                            </Button>
                          </div>
                        )}

                        {!isEditing && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive"
                            onClick={() =>
                              deleteMutation.mutate({ id: item.id })
                            }
                          >
                            x
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
