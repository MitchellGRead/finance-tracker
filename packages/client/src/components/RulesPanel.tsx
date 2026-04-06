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

interface EditState {
  id: number;
  pattern: string;
  action: string;
  categoryName: string;
  ruleType: RuleType;
  userName: string;
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
  const [editing, setEditing] = useState<EditState | null>(null);

  const rulesQuery = useQuery(trpc.rules.list.queryOptions());
  const categoriesQuery = useQuery(trpc.categories.list.queryOptions());
  const usersQuery = useQuery(trpc.users.list.queryOptions());

  const getCategoryId = (name: string) =>
    categoriesQuery.data?.find((c) => c.name === name)?.id;

  const getUserId = (name: string) =>
    usersQuery.data?.find((u) => u.name === name)?.id;

  const getUserName = (id: number) =>
    usersQuery.data?.find((u) => u.id === id)?.name ?? "Unknown";

  const invalidateRules = () =>
    queryClient.invalidateQueries({ queryKey: trpc.rules.list.queryKey() });

  const createMutation = useMutation(
    trpc.rules.create.mutationOptions({
      onSuccess: () => {
        invalidateRules();
        setPattern("");
        setCategoryName("");
        setAction("accept");
      },
    })
  );

  const deleteMutation = useMutation(
    trpc.rules.delete.mutationOptions({ onSuccess: invalidateRules })
  );

  const updateMutation = useMutation(
    trpc.rules.update.mutationOptions({
      onSuccess: () => {
        invalidateRules();
        setEditing(null);
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

  const startEditing = (rule: NonNullable<typeof rulesQuery.data>[number]) => {
    setEditing({
      id: rule.id,
      pattern: rule.pattern,
      action: rule.action ?? "none",
      categoryName: rule.categoryName ?? "",
      ruleType: rule.ruleType as RuleType,
      userName: rule.userId ? getUserName(rule.userId) : "",
    });
  };

  const handleUpdate = () => {
    if (!editing || !editing.pattern.trim()) return;
    const catId = getCategoryId(editing.categoryName) ?? null;
    const editAction =
      editing.action === "none" ? null : (editing.action as "accept" | "reject");

    if (editAction == null && catId == null) return;

    const userId =
      editing.ruleType === "personal" ? getUserId(editing.userName) ?? null : null;
    if (editing.ruleType === "personal" && userId == null) return;

    updateMutation.mutate({
      id: editing.id,
      pattern: editing.pattern.trim(),
      ruleType: editing.ruleType,
      userId,
      action: editAction,
      categoryId: catId,
    });
  };

  const filteredRules = rulesQuery.data?.filter((r) => {
    if (r.ruleType !== ruleType) return false;
    if (searchFilter) {
      const search = searchFilter.toLowerCase();
      return search.includes(r.pattern.toLowerCase());
    }
    return true;
  });

  const renderRuleForm = (
    formState: {
      pattern: string;
      action: string;
      categoryName: string;
      ruleType: RuleType;
      userName: string;
    },
    setField: (field: string, value: string) => void,
    onSubmit: () => void,
    submitLabel: string,
    isPending: boolean,
    onCancel?: () => void
  ) => (
    <div className="space-y-2">
      <div className="flex gap-2">
        <Input
          value={formState.pattern}
          onChange={(e) => setField("pattern", e.target.value)}
          placeholder="Description pattern..."
          className="h-7 text-xs flex-1"
        />
        <Select
          value={formState.ruleType}
          onValueChange={(v) => setField("ruleType", v)}
        >
          <SelectTrigger className="h-7 text-xs w-[90px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="split">Split</SelectItem>
            <SelectItem value="personal">Personal</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="flex gap-2">
        <Select
          value={formState.action}
          onValueChange={(v) => {
            if (v) setField("action", v);
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
          value={formState.categoryName}
          onValueChange={(v) => {
            if (v) setField("categoryName", v === "__none__" ? "" : v);
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
        {formState.ruleType === "personal" && (
          <Select
            value={formState.userName}
            onValueChange={(v) => {
              if (v) setField("userName", v);
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
          onClick={onSubmit}
          disabled={
            !formState.pattern.trim() ||
            (formState.action === "none" && !formState.categoryName) ||
            (formState.ruleType === "personal" && !formState.userName) ||
            isPending
          }
        >
          {submitLabel}
        </Button>
        {onCancel && (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs"
            onClick={onCancel}
          >
            Cancel
          </Button>
        )}
      </div>
    </div>
  );

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
              {filteredRules.map((rule) =>
                editing?.id === rule.id ? (
                  <div
                    key={rule.id}
                    className="py-1.5 px-2 rounded bg-muted/50 border border-primary/20"
                  >
                    {renderRuleForm(
                      editing,
                      (field, value) =>
                        setEditing((prev) =>
                          prev ? { ...prev, [field]: value } : prev
                        ),
                      handleUpdate,
                      "Save",
                      updateMutation.isPending,
                      () => setEditing(null)
                    )}
                  </div>
                ) : (
                  <div
                    key={rule.id}
                    className="flex items-center justify-between text-xs py-1 px-2 rounded bg-muted/50 group cursor-pointer hover:bg-muted"
                    onClick={() => startEditing(rule)}
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
                      onClick={(e) => {
                        e.stopPropagation();
                        deleteMutation.mutate({ id: rule.id });
                      }}
                    >
                      x
                    </Button>
                  </div>
                )
              )}
            </div>
          )}

          {renderRuleForm(
            { pattern, action, categoryName, ruleType, userName },
            (field, value) => {
              if (field === "pattern") setPattern(value);
              else if (field === "action") setAction(value);
              else if (field === "categoryName") setCategoryName(value);
              else if (field === "ruleType") setRuleType(value as RuleType);
              else if (field === "userName") setUserName(value);
            },
            handleCreate,
            "Add",
            createMutation.isPending
          )}
        </div>
      )}
    </div>
  );
}
