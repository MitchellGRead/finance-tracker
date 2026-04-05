import { useState } from "react";
import { useTRPC } from "../lib/trpc";
import { useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
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

export function LineItemsTable({ month, year }: LineItemsTableProps) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [userFilter, setUserFilter] = useState<string>("all");
  const [editingNote, setEditingNote] = useState<number | null>(null);
  const [noteValue, setNoteValue] = useState("");

  const usersQuery = useQuery(trpc.users.list.queryOptions());
  const categoriesQuery = useQuery(trpc.categories.list.queryOptions());
  const lineItemsQuery = useQuery(
    trpc.lineItems.list.queryOptions({ month, year })
  );

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: trpc.lineItems.list.queryKey() });
    queryClient.invalidateQueries({ queryKey: trpc.lineItems.countByMonth.queryKey() });
  };

  const updateMutation = useMutation(
    trpc.lineItems.update.mutationOptions({ onSuccess: invalidateAll })
  );
  const deleteMutation = useMutation(
    trpc.lineItems.delete.mutationOptions({ onSuccess: invalidateAll })
  );
  const bulkUpdateMutation = useMutation(
    trpc.lineItems.bulkUpdateStatus.mutationOptions({ onSuccess: invalidateAll })
  );
  const clearOverridesMutation = useMutation(
    trpc.lineItems.clearOverrides.mutationOptions({ onSuccess: invalidateAll })
  );
  const saveAsRuleMutation = useMutation(
    trpc.lineItems.acceptAndCreateRules.mutationOptions({
      onSuccess: () => {
        invalidateAll();
        queryClient.invalidateQueries({ queryKey: trpc.categoryRules.list.queryKey() });
        queryClient.invalidateQueries({ queryKey: trpc.acceptRejectRules.list.queryKey() });
      },
    })
  );

  const items = lineItemsQuery.data ?? [];

  const getUserName = (userId: number) =>
    usersQuery.data?.find((u) => u.id === userId)?.name ?? "Unknown";

  const getCategoryId = (name: string) =>
    categoriesQuery.data?.find((c) => c.name === name)?.id ?? null;

  const filteredItems = items.filter((item) => {
    if (statusFilter !== "all" && item.status !== statusFilter) return false;
    if (userFilter !== "all" && getUserName(item.userId) !== userFilter)
      return false;
    return true;
  });

  const pendingIds = filteredItems
    .filter((item) => item.status === "pending")
    .map((item) => item.id);

  const overrideCount = items.filter(
    (item) => item.statusOverride || item.categoryOverride || item.splitRatioOverride
  ).length;

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

  const hasOverride = (item: {
    statusOverride: boolean;
    categoryOverride: boolean;
    splitRatioOverride: boolean;
  }) => item.statusOverride || item.categoryOverride || item.splitRatioOverride;

  return (
    <div className="space-y-3">
      {/* Filters and bulk actions */}
      <div className="flex items-center gap-3 flex-wrap">
        <Select
          value={statusFilter}
          onValueChange={(v) => { if (v) setStatusFilter(v as StatusFilter); }}
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
          onValueChange={(v) => { if (v) setUserFilter(v); }}
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
        </div>
      </div>

      {/* Table */}
      <div className="rounded-md border">
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
              <TableHead className="w-[80px]"></TableHead>
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
              filteredItems.map((item) => (
                <TableRow
                  key={item.id}
                  className={`${
                    item.status === "rejected" ? "opacity-50" : ""
                  } ${hasOverride(item) ? "border-l-2 border-l-blue-400" : ""}`}
                >
                  {/* Status badge - click to cycle */}
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
                    {item.isManual && (
                      <Badge
                        variant="outline"
                        className="ml-1.5 text-[10px] px-1 py-0"
                      >
                        Manual
                      </Badge>
                    )}
                    {hasOverride(item) && (
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
                    {formatCurrency(item.amount)}
                  </TableCell>

                  {/* Category dropdown — use name as value */}
                  <TableCell>
                    <Select
                      value={item.categoryName ?? "—"}
                      onValueChange={(v) => {
                        if (v === null) return;
                        const catId = v === "—" ? null : getCategoryId(v);
                        updateMutation.mutate({
                          id: item.id,
                          categoryId: catId,
                          categoryOverride: true,
                        });
                      }}
                    >
                      <SelectTrigger className="h-7 text-xs border-none shadow-none px-1">
                        <SelectValue placeholder="—" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="—">—</SelectItem>
                        {categoriesQuery.data?.map((cat) => (
                          <SelectItem key={cat.id} value={cat.name}>
                            {cat.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </TableCell>

                  {/* Split ratio */}
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      {item.splitRatioOverride && (
                        <span className="text-blue-500 text-[10px]" title="Override">*</span>
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
                      {/* Save as Rule — show when item has a category assigned */}
                      {item.categoryId && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 px-1.5 text-[10px] text-muted-foreground hover:text-foreground"
                          title="Accept and save as global rule"
                          onClick={() =>
                            saveAsRuleMutation.mutate({
                              lineItemId: item.id,
                              description: item.description,
                              userId: item.userId,
                              categoryId: item.categoryId!,
                            })
                          }
                        >
                          Rule
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive"
                        onClick={() => deleteMutation.mutate({ id: item.id })}
                      >
                        x
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
