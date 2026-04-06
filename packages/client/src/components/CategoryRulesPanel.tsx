import { useState } from "react";
import { useTRPC } from "../lib/trpc";
import { useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Badge } from "./ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select";
import { Tabs, TabsList, TabsTrigger } from "./ui/tabs";
import type { CategoryRuleType } from "@finance-tracker/shared";

export function CategoryRulesPanel() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [pattern, setPattern] = useState("");
  const [categoryName, setCategoryName] = useState<string>("");
  const [userName, setUserName] = useState<string>("");
  const [ruleType, setRuleType] = useState<CategoryRuleType>("split");
  const [expanded, setExpanded] = useState(false);

  const rulesQuery = useQuery(trpc.categoryRules.list.queryOptions());
  const categoriesQuery = useQuery(trpc.categories.list.queryOptions());
  const usersQuery = useQuery(trpc.users.list.queryOptions());

  const getCategoryId = (name: string) =>
    categoriesQuery.data?.find((c) => c.name === name)?.id;

  const getUserId = (name: string) =>
    usersQuery.data?.find((u) => u.name === name)?.id;

  const getUserName = (id: number) =>
    usersQuery.data?.find((u) => u.id === id)?.name ?? "Unknown";

  const createMutation = useMutation(
    trpc.categoryRules.create.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries({
          queryKey: trpc.categoryRules.list.queryKey(),
        });
        setPattern("");
        setCategoryName("");
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
    const catId = getCategoryId(categoryName);
    if (!pattern.trim() || !catId) return;

    if (ruleType === "personal") {
      const userId = getUserId(userName);
      if (!userId) return;
      createMutation.mutate({
        pattern: pattern.trim(),
        categoryId: catId,
        createdByUserId: userId,
        ruleType: "personal",
        userId,
      });
    } else {
      const firstUser = usersQuery.data?.[0];
      if (!firstUser) return;
      createMutation.mutate({
        pattern: pattern.trim(),
        categoryId: catId,
        createdByUserId: firstUser.id,
        ruleType: "split",
        userId: null,
      });
    }
  };

  const filteredRules = rulesQuery.data?.filter(
    (r) => r.ruleType === ruleType
  );

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
          <Tabs
            value={ruleType}
            onValueChange={(v) => setRuleType(v as CategoryRuleType)}
          >
            <TabsList className="h-7 w-full">
              <TabsTrigger value="split" className="text-xs flex-1">
                Split
              </TabsTrigger>
              <TabsTrigger value="personal" className="text-xs flex-1">
                Personal
              </TabsTrigger>
            </TabsList>
          </Tabs>

          {filteredRules && filteredRules.length > 0 && (
            <div className="space-y-1 max-h-[200px] overflow-y-auto">
              {filteredRules.map((rule) => (
                <div
                  key={rule.id}
                  className="flex items-center justify-between text-xs py-1 px-2 rounded bg-muted/50 group"
                >
                  <div className="flex items-center gap-1.5 flex-1 min-w-0">
                    <span className="font-mono text-foreground">
                      {rule.pattern}
                    </span>
                    <span className="text-muted-foreground mx-0.5">
                      &rarr;
                    </span>
                    <span className="text-muted-foreground">
                      {rule.categoryName ?? "Unknown"}
                    </span>
                    {rule.ruleType === "personal" && rule.userId && (
                      <Badge
                        variant="outline"
                        className="text-[10px] px-1 py-0"
                      >
                        {getUserName(rule.userId)}
                      </Badge>
                    )}
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

          <div className="space-y-2">
            <Input
              value={pattern}
              onChange={(e) => setPattern(e.target.value)}
              placeholder="Description pattern..."
              className="h-7 text-xs"
            />
            <div className="flex gap-2">
              <Select
                value={categoryName}
                onValueChange={(v) => {
                  if (v) setCategoryName(v);
                }}
              >
                <SelectTrigger className="h-7 text-xs flex-1">
                  <SelectValue placeholder="Category" />
                </SelectTrigger>
                <SelectContent>
                  {categoriesQuery.data?.map((cat) => (
                    <SelectItem key={cat.id} value={cat.name}>
                      {cat.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {ruleType === "personal" && (
                <Select
                  value={userName}
                  onValueChange={(v) => {
                    if (v) setUserName(v);
                  }}
                >
                  <SelectTrigger className="h-7 text-xs w-[100px]">
                    <SelectValue placeholder="User" />
                  </SelectTrigger>
                  <SelectContent>
                    {usersQuery.data?.map((user) => (
                      <SelectItem key={user.id} value={user.name}>
                        {user.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              <Button
                size="sm"
                className="h-7 text-xs"
                onClick={handleCreate}
                disabled={
                  !pattern.trim() ||
                  !categoryName ||
                  (ruleType === "personal" && !userName) ||
                  createMutation.isPending
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
