import { useState } from "react";
import { useTRPC } from "../lib/trpc";
import { useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select";

export function CategoryRulesPanel() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [pattern, setPattern] = useState("");
  const [categoryId, setCategoryId] = useState<string>("");
  const [expanded, setExpanded] = useState(false);

  const rulesQuery = useQuery(trpc.categoryRules.list.queryOptions());
  const categoriesQuery = useQuery(trpc.categories.list.queryOptions());
  const usersQuery = useQuery(trpc.users.list.queryOptions());

  const createMutation = useMutation(
    trpc.categoryRules.create.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries({
          queryKey: trpc.categoryRules.list.queryKey(),
        });
        setPattern("");
        setCategoryId("");
      },
    })
  );

  const deleteMutation = useMutation(
    trpc.categoryRules.delete.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries({
          queryKey: trpc.categoryRules.list.queryKey(),
        });
      },
    })
  );

  const handleCreate = () => {
    if (!pattern.trim() || !categoryId) return;
    // Use first user as default creator (single-operator model)
    const firstUser = usersQuery.data?.[0];
    if (!firstUser) return;
    createMutation.mutate({
      pattern: pattern.trim(),
      categoryId: parseInt(categoryId),
      createdByUserId: firstUser.id,
    });
  };

  return (
    <div className="rounded-lg border bg-card p-4 shadow-sm">
      <button
        className="flex w-full items-center justify-between text-sm font-semibold text-foreground"
        onClick={() => setExpanded(!expanded)}
      >
        <span>Category Rules</span>
        <span className="text-xs text-muted-foreground">
          {rulesQuery.data?.length ?? 0} rules {expanded ? "▾" : "▸"}
        </span>
      </button>

      {expanded && (
        <div className="mt-3 space-y-3">
          {/* Existing rules */}
          {rulesQuery.data && rulesQuery.data.length > 0 && (
            <div className="space-y-1 max-h-[200px] overflow-y-auto">
              {rulesQuery.data.map((rule) => (
                <div
                  key={rule.id}
                  className="flex items-center justify-between text-xs py-1 px-2 rounded bg-muted/50 group"
                >
                  <div className="flex-1 min-w-0">
                    <span className="font-mono text-foreground">
                      {rule.pattern}
                    </span>
                    <span className="text-muted-foreground mx-1">&rarr;</span>
                    <span className="text-muted-foreground">
                      {rule.categoryName ?? "Unknown"}
                    </span>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-5 w-5 p-0 opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive"
                    onClick={() => deleteMutation.mutate({ id: rule.id })}
                  >
                    x
                  </Button>
                </div>
              ))}
            </div>
          )}

          {/* Add new rule */}
          <div className="space-y-2">
            <Input
              value={pattern}
              onChange={(e) => setPattern(e.target.value)}
              placeholder="Description pattern..."
              className="h-7 text-xs"
            />
            <div className="flex gap-2">
              <Select
                value={categoryId}
                onValueChange={(v) => {
                  if (v) setCategoryId(v);
                }}
              >
                <SelectTrigger className="h-7 text-xs flex-1">
                  <SelectValue placeholder="Category" />
                </SelectTrigger>
                <SelectContent>
                  {categoriesQuery.data?.map((cat) => (
                    <SelectItem key={cat.id} value={String(cat.id)}>
                      {cat.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                size="sm"
                className="h-7 text-xs"
                onClick={handleCreate}
                disabled={
                  !pattern.trim() || !categoryId || createMutation.isPending
                }
              >
                Add
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
