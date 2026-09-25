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
import { CategoryCell } from "./CategoryCell";
import { SplitCell } from "./SplitCell";
import { Sparkles } from "lucide-react";
import {
  findMatchingRule,
  isRealOverride,
  itemDivergesFromRule,
  type MatchedRule,
} from "../lib/lineItemRules";
import {
  getLiveSuggestion,
  hasLiveSuggestion,
  type LiveSuggestion,
} from "../lib/suggestions";
import { chunkIds } from "../lib/chunk";
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
type SuggestionFilter = "all" | "has" | "none";

export function LineItemsTable({ month, year }: LineItemsTableProps) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [userFilter, setUserFilter] = useState<string>("all");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [editingNote, setEditingNote] = useState<number | null>(null);
  const [noteValue, setNoteValue] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [suggestionFilter, setSuggestionFilter] = useState<SuggestionFilter>("all");
  const [suggestingIds, setSuggestingIds] = useState<Set<number>>(new Set());
  const [suggestProgress, setSuggestProgress] = useState<{
    done: number;
    total: number;
  } | null>(null);

  // Rule creation popover state
  const [ruleItemId, setRuleItemId] = useState<number | null>(null);
  const [rulePattern, setRulePattern] = useState("");
  const [ruleType, setRuleType] = useState<"split" | "personal">("split");

  const usersQuery = useQuery(trpc.users.list.queryOptions());
  const categoriesQuery = useQuery(trpc.categories.list.queryOptions());
  const lineItemsQuery = useQuery(
    trpc.lineItems.list.queryOptions({ month, year })
  );
  const rulesQuery = useQuery(trpc.rules.list.queryOptions());
  const suggestionsConfigQuery = useQuery(trpc.suggestions.config.queryOptions());
  const suggestionsEnabled = suggestionsConfigQuery.data?.enabled ?? false;

  const invalidateAll = () => {
    queryClient.invalidateQueries({
      queryKey: trpc.lineItems.list.queryKey(),
    });
    queryClient.invalidateQueries({
      queryKey: trpc.lineItems.countByMonth.queryKey(),
    });
    // Category edits change the picker's "Most used" section, which reads
    // usageCounts; without this it stays stale for up to staleTime.
    queryClient.invalidateQueries({
      queryKey: trpc.categories.usageCounts.queryKey(),
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

  const generateSuggestionsMutation = useMutation(
    trpc.suggestions.generate.mutationOptions()
  );

  /**
   * Generation is chunked and awaited sequentially: httpBatchLink would coalesce
   * concurrent calls into one long request, losing the progressive reveal. Each
   * chunk invalidates on its own, so partial results land as they arrive and a
   * mid-run failure keeps everything generated so far.
   */
  const runSuggestions = async (ids: number[]) => {
    if (ids.length === 0) return;
    const chunks = chunkIds(ids, 25);
    setSuggestProgress({ done: 0, total: ids.length });

    try {
      for (const [index, chunk] of chunks.entries()) {
        setSuggestingIds(new Set(chunk));
        try {
          await generateSuggestionsMutation.mutateAsync({ ids: chunk });
        } finally {
          setSuggestProgress({
            done: Math.min((index + 1) * 25, ids.length),
            total: ids.length,
          });
          invalidateAll();
        }
      }
    } finally {
      setSuggestingIds(new Set());
      setSuggestProgress(null);
    }
  };

  const items = lineItemsQuery.data ?? [];
  const allRules = rulesQuery.data ?? [];

  const getUserName = (userId: number) =>
    usersQuery.data?.find((u) => u.id === userId)?.name ?? "Unknown";

  const categoryList = categoriesQuery.data ?? [];

  const ruleFor = (item: { description: string; userId: number }): MatchedRule | null =>
    findMatchingRule(item.description, allRules, item.userId);

  const suggestionFor = (item: Parameters<typeof getLiveSuggestion>[0] & {
    description: string;
    userId: number;
  }): LiveSuggestion => getLiveSuggestion(item, categoryList, ruleFor(item));

  const filteredItems = items.filter((item) => {
    if (statusFilter !== "all" && item.status !== statusFilter) return false;
    if (userFilter !== "all" && getUserName(item.userId) !== userFilter)
      return false;
    if (categoryFilter !== "all") {
      if (categoryFilter === "uncategorized") {
        if (item.categoryId !== null) return false;
      } else if (String(item.categoryId) !== categoryFilter) {
        return false;
      }
    }
    if (suggestionFilter !== "all") {
      const has = hasLiveSuggestion(suggestionFor(item));
      if (suggestionFilter === "has" && !has) return false;
      if (suggestionFilter === "none" && has) return false;
    }
    return true;
  });

  const pendingIds = filteredItems
    .filter((item) => item.status === "pending")
    .map((item) => item.id);

  const overrideCount = items.filter((item) => isRealOverride(item)).length;

  const suggestedIds = filteredItems
    .filter((item) => hasLiveSuggestion(suggestionFor(item)))
    .map((item) => item.id);

  // Items worth spending tokens on: pending and never looked at.
  const unsuggestedIds = filteredItems
    .filter((item) => item.status === "pending" && item.suggestionStatus === null)
    .map((item) => item.id);

  const pendingSuggestionSet = new Set(suggestedIds);
  const pendingSuggestionCount = pendingIds.filter((id) =>
    pendingSuggestionSet.has(id)
  ).length;

  /** Applies category and split suggestions without touching status. */
  const applySuggestions = (ids: number[]) => {
    const target = new Set(ids);
    for (const item of filteredItems) {
      if (!target.has(item.id)) continue;
      const suggestion = suggestionFor(item);
      const updates: {
        id: number;
        categoryId?: number;
        categoryOverride?: boolean;
        splitRatio?: number;
        splitRatioOverride?: boolean;
      } = { id: item.id };

      if (suggestion.category?.mode === "ghost") {
        updates.categoryId = suggestion.category.categoryId;
        updates.categoryOverride = true;
      }
      if (suggestion.split !== null) {
        updates.splitRatio = suggestion.split.ratio;
        updates.splitRatioOverride = true;
      }
      if (Object.keys(updates).length > 1) updateMutation.mutate(updates);
    }
  };

  /**
   * Accepting materializes every untouched suggestion on the server, so a
   * month-wide bulk accept can commit a lot of AI guesses in one click. Confirm
   * when that is actually what is about to happen.
   */
  const acceptAllPending = () => {
    if (
      pendingSuggestionCount > 0 &&
      !window.confirm(
        `Accept ${pendingIds.length} pending items?\n\nThis also applies Jev's ` +
          `suggestions on ${pendingSuggestionCount} of them.`
      )
    ) {
      return;
    }
    bulkUpdateMutation.mutate({ ids: pendingIds, status: "accepted" });
  };

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

        <Select
          value={categoryFilter}
          onValueChange={(v) => {
            if (v) setCategoryFilter(v);
          }}
        >
          <SelectTrigger className="h-8 w-[160px] text-sm">
            <SelectValue placeholder="Category" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Categories</SelectItem>
            <SelectItem value="uncategorized">Uncategorized</SelectItem>
            {categoriesQuery.data?.map((category) => (
              <SelectItem key={category.id} value={String(category.id)}>
                {category.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {suggestionsEnabled && (
          <Select
            value={suggestionFilter}
            onValueChange={(v) => {
              if (v) setSuggestionFilter(v as SuggestionFilter);
            }}
          >
            <SelectTrigger className="h-8 w-[150px] text-sm">
              <SelectValue placeholder="Suggestions" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Suggestions</SelectItem>
              <SelectItem value="has">Has suggestion</SelectItem>
              <SelectItem value="none">No suggestion</SelectItem>
            </SelectContent>
          </Select>
        )}

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
              {suggestionsEnabled && (
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs border-cyan-300 text-cyan-700 hover:bg-cyan-50"
                  disabled={suggestProgress !== null}
                  title="Ask Jev for a category and split on the selected items"
                  onClick={() => void runSuggestions(selectedArray)}
                >
                  <Sparkles className="h-3 w-3 mr-1" aria-hidden />
                  {suggestProgress
                    ? `Suggesting ${suggestProgress.done}/${suggestProgress.total}…`
                    : "Suggest"}
                </Button>
              )}
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
              {suggestionsEnabled && unsuggestedIds.length > 0 && (
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs border-cyan-300 text-cyan-700 hover:bg-cyan-50"
                  disabled={suggestProgress !== null}
                  onClick={() => void runSuggestions(unsuggestedIds)}
                >
                  <Sparkles className="h-3 w-3 mr-1" aria-hidden />
                  {suggestProgress
                    ? `Suggesting ${suggestProgress.done}/${suggestProgress.total}…`
                    : `Suggest (${unsuggestedIds.length})`}
                </Button>
              )}
              {suggestionsEnabled && suggestedIds.length > 0 && (
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs border-cyan-300 text-cyan-700 hover:bg-cyan-50"
                  title="Apply Jev's category and split suggestions without changing status"
                  onClick={() => applySuggestions(suggestedIds)}
                >
                  <Sparkles className="h-3 w-3 mr-1" aria-hidden />
                  Apply Jev ({suggestedIds.length})
                </Button>
              )}
              {pendingIds.length > 0 && (
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() => acceptAllPending()}
                >
                  Accept all pending ({pendingIds.length})
                  {pendingSuggestionCount > 0 &&
                    ` · applies ${pendingSuggestionCount} suggestion${
                      pendingSuggestionCount === 1 ? "" : "s"
                    }`}
                </Button>
              )}
            </>
          )}
        </div>
      </div>

      {suggestProgress !== null && (
        <div className="flex items-center gap-2 rounded-md border border-cyan-300 bg-cyan-50 px-3 py-1.5 text-xs text-cyan-700">
          <Sparkles className="h-3 w-3 animate-pulse" aria-hidden />
          Jev is reviewing {suggestProgress.total} item
          {suggestProgress.total === 1 ? "" : "s"} — {suggestProgress.done} done
        </div>
      )}

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
                const suggestion = getLiveSuggestion(item, categoryList, matchedRule);
                const showsSuggestion = hasLiveSuggestion(suggestion);
                const isSuggesting = suggestingIds.has(item.id);

                return (
                  <TableRow
                    key={item.id}
                    className={`${
                      item.status === "rejected" ? "opacity-50" : ""
                    } ${
                      realOverride
                        ? "border-l-2 border-l-blue-400"
                        : showsSuggestion
                          ? "border-l-2 border-l-cyan-300"
                          : ""
                    }`}
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
                        title={
                          showsSuggestion
                            ? `Click to cycle status — accepting also applies Jev's suggestion${
                                suggestion.category
                                  ? `: ${suggestion.category.categoryName}`
                                  : ""
                              }${
                                suggestion.split
                                  ? `${suggestion.category ? "," : ":"} ${
                                      suggestion.split.isPersonal
                                        ? "Personal"
                                        : `${Math.round(suggestion.split.ratio * 100)}% split`
                                    }`
                                  : ""
                              }`
                            : undefined
                        }
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
                      <CategoryCell
                        categoryName={item.categoryName}
                        suggestion={suggestion.category}
                        isSuggesting={isSuggesting}
                        onSelect={(catId) => {
                          updateMutation.mutate({
                            id: item.id,
                            categoryId: catId,
                            categoryOverride: true,
                          });
                        }}
                        onAcceptSuggestion={() => {
                          if (suggestion.category === null) return;
                          updateMutation.mutate({
                            id: item.id,
                            categoryId: suggestion.category.categoryId,
                            categoryOverride: true,
                          });
                        }}
                      />
                    </TableCell>

                    {/* Split ratio */}
                    <TableCell className="text-right">
                      <SplitCell
                        splitRatio={item.splitRatio}
                        splitRatioOverride={item.splitRatioOverride}
                        suggestion={suggestion.split}
                        onChange={(splitRatio) =>
                          updateMutation.mutate({
                            id: item.id,
                            splitRatio,
                            splitRatioOverride: true,
                          })
                        }
                      />
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

                        {/* Jev disagrees with the value already in the cell */}
                        {suggestion.category?.mode === "badge" && (
                          <Badge
                            variant="outline"
                            className="text-[9px] px-1 py-0 border-cyan-400 text-cyan-600 cursor-pointer"
                            title={`Jev suggests: ${suggestion.category.categoryName}${
                              suggestion.category.confidence !== null
                                ? ` (${Math.round(suggestion.category.confidence * 100)}%)`
                                : ""
                            } — click to apply`}
                            onClick={() => {
                              if (suggestion.category === null) return;
                              updateMutation.mutate({
                                id: item.id,
                                categoryId: suggestion.category.categoryId,
                                categoryOverride: true,
                              });
                            }}
                          >
                            J
                          </Badge>
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
