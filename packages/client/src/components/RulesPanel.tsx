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
import type { RuleType } from "@finance-tracker/shared";

interface RulesPanelProps {
  searchFilter?: string;
}

export function RulesPanel({ searchFilter = "" }: RulesPanelProps) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [pattern, setPattern] = useState("");
  const [categoryName, setCategoryName] = useState<string>("");
  const [userName, setUserName] = useState<string>("");
  const [action, setAction] = useState<string>("accept");
  const [ruleType, setRuleType] = useState<RuleType>("split");
  const [expanded, setExpanded] = useState(false);

  const rulesQuery = useQuery(trpc.rules.list.queryOptions());
  const categoriesQuery = useQuery(trpc.categories.list.queryOptions());
  const usersQuery = useQuery(trpc.users.list.queryOptions());

  const getCategoryId = (name: string) =>
    categoriesQuery.data?.find((c) => c.name === name)?.id;

  const getUserId = (name: string) =>
    usersQuery.data?.find((u) => u.name === name)?.id;

  const getUserName = (id: number) =>
    usersQuery.data?.find((u) => u.id === id)?.name ?? "Unknown";

  const createMutation = useMutation(
    trpc.rules.create.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries({
          queryKey: trpc.rules.list.queryKey(),
        });
        setPattern("");
        setCategoryName("");
        setAction("accept");
      },
    })
  );

  const deleteMutation = useMutation(
    trpc.rules.delete.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries({
          queryKey: trpc.rules.list.queryKey(),
        });
      },
    })
  );

  const handleCreate = () => {
    if (!pattern.trim()) return;
    const catId = getCategoryId(categoryName) ?? null;
    const ruleAction = action === "none" ? null : (action as "accept" | "reject");

    if (ruleAction == null && catId == null) return;

    if (ruleType === "personal") {
      const userId = getUserId(userName);
      if (!userId) return;
      createMutation.mutate({
        pattern: pattern.trim(),
        ruleType: "personal",
        userId,
        action: ruleAction,
        categoryId: catId,
        createdByUserId: userId,
      });
    } else {
      const firstUser = usersQuery.data?.[0];
      if (!firstUser) return;
      createMutation.mutate({
        pattern: pattern.trim(),
        ruleType: "split",
        userId: null,
        action: ruleAction,
        categoryId: catId,
        createdByUserId: firstUser.id,
      });
    }
  };

  const filteredRules = rulesQuery.data?.filter((r) => {
    if (r.ruleType !== ruleType) return false;
    if (searchFilter) {
      const search = searchFilter.toLowerCase();
      return search.includes(r.pattern.toLowerCase());
    }
    return true;
  });

  return (
    <div className="rounded-lg border bg-card p-4 shadow-sm">
      <button
        className="flex w-full items-center justify-between text-sm font-semibold text-foreground"
        onClick={() => setExpanded(!expanded)}
      >
        <span>Rules</span>
        <span className="text-xs text-muted-foreground">
          {searchFilter
            ? `${filteredRules?.length ?? 0}/${rulesQuery.data?.length ?? 0}`
            : `${rulesQuery.data?.length ?? 0}`}{" "}
          rules {expanded || searchFilter ? "▾" : "▸"}
        </span>
      </button>

      {(expanded || searchFilter) && (
        <div className="mt-3 space-y-3">
          <Tabs
            value={ruleType}
            onValueChange={(v) => setRuleType(v as RuleType)}
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
            <div className="space-y-1 max-h-[280px] overflow-y-auto">
              {filteredRules.map((rule) => (
                <div
                  key={rule.id}
                  className="flex items-center justify-between text-xs py-1 px-2 rounded bg-muted/50 group"
                >
                  <div className="flex items-center gap-1.5 flex-1 min-w-0">
                    {rule.action && (
                      <Badge
                        variant={
                          rule.action === "reject" ? "destructive" : "default"
                        }
                        className="text-[10px] px-1 py-0 shrink-0"
                      >
                        {rule.action}
                      </Badge>
                    )}
                    <span className="font-mono text-foreground truncate">
                      {rule.pattern}
                    </span>
                    {rule.categoryName && (
                      <>
                        <span className="text-muted-foreground mx-0.5">
                          &rarr;
                        </span>
                        <span className="text-muted-foreground truncate">
                          {rule.categoryName}
                        </span>
                      </>
                    )}
                    {rule.ruleType === "personal" && rule.userId && (
                      <Badge
                        variant="outline"
                        className="text-[10px] px-1 py-0 shrink-0"
                      >
                        {getUserName(rule.userId)}
                      </Badge>
                    )}
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-5 w-5 p-0 opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive shrink-0"
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
                value={action}
                onValueChange={(v) => {
                  if (v) setAction(v);
                }}
              >
                <SelectTrigger className="h-7 text-xs w-[90px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="accept">Accept</SelectItem>
                  <SelectItem value="reject">Reject</SelectItem>
                  <SelectItem value="none">No action</SelectItem>
                </SelectContent>
              </Select>
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
                  <SelectItem value="__none__">No category</SelectItem>
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
                  (action === "none" && !categoryName) ||
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
