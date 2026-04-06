import { useState, useRef } from "react";
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

interface MatchedRule {
  pattern: string;
  action: string | null;
  categoryName: string | null;
  isPersonal: boolean;
}

function findMatchingRule(
  description: string,
  allRules: Array<{
    pattern: string;
    ruleType: string;
    userId: number | null;
    action: string | null;
    categoryName: string | null;
  }>,
  itemUserId: number
): MatchedRule | null {
  const descLower = description.toLowerCase();

  // Filter applicable rules: split rules + personal rules for this user
  const applicable = allRules.filter(
    (r) =>
      r.ruleType === "split" ||
      (r.ruleType === "personal" && r.userId === itemUserId)
  );

  // Find best match (longest pattern, personal wins at equal length)
  let best: (typeof applicable)[number] | null = null;
  let bestLen = 0;
  let bestIsPersonal = false;
  for (const rule of applicable) {
    if (!descLower.includes(rule.pattern.toLowerCase())) continue;
    const isPersonal = rule.ruleType === "personal";
    if (
      rule.pattern.length > bestLen ||
      (rule.pattern.length === bestLen && isPersonal && !bestIsPersonal)
    ) {
      best = rule;
      bestLen = rule.pattern.length;
      bestIsPersonal = isPersonal;
    }
  }

  if (!best) return null;
  return {
    pattern: best.pattern,
    action: best.action,
    categoryName: best.categoryName,
    isPersonal: best.ruleType === "personal",
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

/**
 * Check whether the item's current state diverges from what the matching
 * rule would produce.
 */
function itemDivergesFromRule(
  item: {
    status: string;
    categoryName: string | null;
    splitRatio: number;
  },
  rule: MatchedRule
): boolean {
  if (rule.action) {
    const expectedStatus =
      rule.action === "accept" ? "accepted" : "rejected";
    if (item.status !== expectedStatus) return true;
  }

  if (rule.categoryName) {
    if (item.categoryName !== rule.categoryName) return true;
  }

  if (rule.isPersonal && item.splitRatio !== 1.0) return true;

  return false;
}

export function LineItemsTable({ month, year }: LineItemsTableProps) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [userFilter, setUserFilter] = useState<string>("all");
  const [editingNote, setEditingNote] = useState<number | null>(null);
  const [noteValue, setNoteValue] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());

  // Rule creation popover state
  const [ruleItemId, setRuleItemId] = useState<number | null>(null);
  const [rulePattern, setRulePattern] = useState("");
  const [ruleType, setRuleType] = useState<"split" | "personal">("split");

  const usersQuery = useQuery(trpc.users.list.queryOptions());
  const lineItemsQuery = useQuery(
    trpc.lineItems.list.queryOptions({ month, year })
  );
  const rulesQuery = useQuery(trpc.rules.list.queryOptions());

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
  const clearItemOverridesMutation = useMutation(
    trpc.lineItems.clearItemOverrides.mutationOptions({
      onSuccess: invalidateAll,
    })
  );
  const bulkCategoryMutation = useMutation(
    trpc.lineItems.bulkUpdateCategory.mutationOptions({
      onSuccess: invalidateAll,
    })
  );
  const bulkSplitMutation = useMutation(
    trpc.lineItems.bulkUpdateSplitRatio.mutationOptions({
      onSuccess: invalidateAll,
    })
  );
  const saveAsRuleMutation = useMutation(
    trpc.lineItems.acceptAndCreateRules.mutationOptions({
      onSuccess: () => {
        invalidateAll();
        queryClient.invalidateQueries({
          queryKey: trpc.rules.list.queryKey(),
        });
        setRuleItemId(null);
      },
    })
  );

  const items = lineItemsQuery.data ?? [];
  const allRules = rulesQuery.data ?? [];

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

  const lastClickedId = useRef<number | null>(null);

  const toggleSelected = (id: number, shiftKey: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);

      if (shiftKey && lastClickedId.current !== null) {
        const ids = filteredItems.map((item) => item.id);
        const startIdx = ids.indexOf(lastClickedId.current);
        const endIdx = ids.indexOf(id);
        if (startIdx !== -1 && endIdx !== -1) {
          const [from, to] = startIdx < endIdx ? [startIdx, endIdx] : [endIdx, startIdx];
          for (let i = from; i <= to; i++) {
            next.add(ids[i]);
          }
          lastClickedId.current = id;
          return next;
        }
      }

      if (next.has(id)) next.delete(id);
      else next.add(id);
      lastClickedId.current = id;
      return next;
    });
  };

  const toggleSelectAll = () => {
    const filteredIds = filteredItems.map((item) => item.id);
    const allSelected = filteredIds.every((id) => selectedIds.has(id));
    if (allSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredIds));
    }
  };

  const selectedArray = Array.from(selectedIds);

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
    // Default to personal if item is already 100% split ratio
    setRuleType(item.splitRatio === 1.0 ? "personal" : "split");
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
      ruleType,
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
          {selectedIds.size > 0 ? (
            <>
              <span className="font-medium text-foreground">
                {selectedIds.size} selected
              </span>
              <Select
                value=""
                onValueChange={(v) => {
                  if (v)
                    bulkUpdateMutation.mutate({
                      ids: selectedArray,
                      status: v as "pending" | "accepted" | "rejected",
                    });
                }}
              >
                <SelectTrigger className="h-7 text-xs w-[100px]">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="accepted">Accept</SelectItem>
                  <SelectItem value="rejected">Reject</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                </SelectContent>
              </Select>
              <CategoryPicker
                onSelect={(catId) => {
                  bulkCategoryMutation.mutate({
                    ids: selectedArray,
                    categoryId: catId,
                  });
                }}
                trigger={({ toggle }) => (
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs"
                    onClick={toggle}
                  >
                    Category
                  </Button>
                )}
              />
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs"
                onClick={() =>
                  bulkSplitMutation.mutate({
                    ids: selectedArray,
                    splitRatio: 1.0,
                  })
                }
              >
                Personal
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs"
                onClick={() =>
                  bulkSplitMutation.mutate({
                    ids: selectedArray,
                    splitRatio: 0.5,
                  })
                }
              >
                50/50
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs"
                onClick={() =>
                  clearItemOverridesMutation.mutate({ ids: selectedArray })
                }
              >
                Clear Overrides
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs"
                onClick={() => setSelectedIds(new Set())}
              >
                Deselect
              </Button>
            </>
          ) : (
            <>
              <span>{filteredItems.length} items</span>
              {overrideCount > 0 && (
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() =>
                    clearOverridesMutation.mutate({ month, year })
                  }
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
            </>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="rounded-md border flex-1 min-h-0 overflow-y-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[30px] px-2">
                <input
                  type="checkbox"
                  checked={
                    filteredItems.length > 0 &&
                    filteredItems.every((item) => selectedIds.has(item.id))
                  }
                  onChange={toggleSelectAll}
                  className="rounded border-muted-foreground/40"
                />
              </TableHead>
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
                  colSpan={10}
                  className="text-center text-muted-foreground py-8"
                >
                  {lineItemsQuery.isLoading
                    ? "Loading..."
                    : "No line items for this period. Import a statement to get started."}
                </TableCell>
              </TableRow>
            ) : (
              filteredItems.map((item) => {
                const matchedRule = findMatchingRule(
                  item.description,
                  allRules,
                  item.userId
                );
                const hasCoverage = matchedRule !== null;
                const diverges = hasCoverage
                  ? itemDivergesFromRule(item, matchedRule)
                  : false;
                const showRuleButton =
                  (!hasCoverage && isModifiedFromDefault(item)) || diverges;
                const isEditing = ruleItemId === item.id;
                const realOverride = hasCoverage
                  ? diverges && isRealOverride(item)
                  : isRealOverride(item);

                return (
                  <TableRow
                    key={item.id}
                    className={`${
                      item.status === "rejected" ? "opacity-50" : ""
                    } ${realOverride ? "border-l-2 border-l-blue-400" : ""}`}
                  >
                    {/* Checkbox */}
                    <TableCell className="px-2">
                      <input
                        type="checkbox"
                        checked={selectedIds.has(item.id)}
                        onChange={(e) => toggleSelected(item.id, e.nativeEvent instanceof MouseEvent && e.nativeEvent.shiftKey)}
                        className="rounded border-muted-foreground/40"
                      />
                    </TableCell>

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
                        <button
                          className="ml-1.5 inline-flex items-center rounded-md border border-blue-400 text-blue-500 px-1 py-0 text-[10px] font-medium hover:bg-blue-50 hover:border-blue-500"
                          title="Click to clear overrides and re-apply rules"
                          onClick={(e) => {
                            e.stopPropagation();
                            clearItemOverridesMutation.mutate({
                              ids: [item.id],
                            });
                          }}
                        >
                          Override
                        </button>
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
                        {item.splitRatio === 1.0 ? (
                          <button
                            className="h-7 px-2 text-[10px] rounded border bg-orange-100 border-orange-300 text-orange-700"
                            title="Personal (100%) — click to switch to split"
                            onClick={() =>
                              updateMutation.mutate({
                                id: item.id,
                                splitRatio: 0.5,
                                splitRatioOverride: true,
                              })
                            }
                          >
                            Personal
                          </button>
                        ) : (
                          <div className="flex items-center gap-0.5">
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
                              className="h-7 w-14 text-xs text-right px-1"
                            />
                            <button
                              className="h-7 px-1 text-[10px] rounded border border-muted-foreground/20 text-muted-foreground hover:bg-orange-50 hover:text-orange-600 hover:border-orange-300"
                              title="Mark as personal (100%)"
                              onClick={() =>
                                updateMutation.mutate({
                                  id: item.id,
                                  splitRatio: 1.0,
                                  splitRatioOverride: true,
                                })
                              }
                            >
                              P
                            </button>
                          </div>
                        )}
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
                        {/* Rule indicators for items covered by a rule */}
                        {matchedRule && (
                          <div className="flex gap-0.5">
                            {matchedRule.action && (
                              <Badge
                                variant="outline"
                                className="text-[9px] px-1 py-0 border-green-400 text-green-600"
                                title={`Rule: "${matchedRule.pattern}" → ${matchedRule.action}`}
                              >
                                S
                              </Badge>
                            )}
                            {matchedRule.categoryName && (
                              <Badge
                                variant="outline"
                                className={`text-[9px] px-1 py-0 ${
                                  matchedRule.isPersonal
                                    ? "border-orange-400 text-orange-600"
                                    : "border-purple-400 text-purple-600"
                                }`}
                                title={`${matchedRule.isPersonal ? "Personal" : "Split"} rule: "${matchedRule.pattern}" → ${matchedRule.categoryName}`}
                              >
                                {matchedRule.isPersonal ? "P" : "C"}
                              </Badge>
                            )}
                          </div>
                        )}

                        {/* Save/Update Rule button */}
                        {showRuleButton && !isEditing && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 px-1.5 text-[10px] text-muted-foreground hover:text-foreground"
                            title={
                              diverges
                                ? "Item diverges from matched rule — save as new rule"
                                : "Save as rule"
                            }
                            onClick={() => openRulePopover(item)}
                          >
                            {diverges ? "Update Rule" : "+ Rule"}
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
                            <button
                              className={`h-6 px-1.5 text-[10px] rounded border ${
                                ruleType === "personal"
                                  ? "bg-orange-100 border-orange-300 text-orange-700"
                                  : "bg-muted border-muted-foreground/20 text-muted-foreground"
                              }`}
                              onClick={() =>
                                setRuleType(
                                  ruleType === "split" ? "personal" : "split"
                                )
                              }
                              title={
                                ruleType === "personal"
                                  ? "Personal rule (100% this user, no split)"
                                  : "Split rule (shared across users)"
                              }
                            >
                              {ruleType === "personal" ? "Personal" : "Split"}
                            </button>
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
