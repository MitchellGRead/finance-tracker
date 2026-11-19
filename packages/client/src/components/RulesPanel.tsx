import { useEffect, useRef, useState } from "react";
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
import type { RuleType } from "@finance-tracker/shared";
import { descriptionMatchesPattern } from "@finance-tracker/shared";

/**
 * The Rules dialog shows what each rule *does*: rules are ordered by how many
 * stored items they decide, and "Needs attention" narrows to rules that match
 * nothing, are overshadowed by a more specific rule, or tie with another rule.
 * Rules are created from the workspace (`+ Rule` / `Update Rule`), never here.
 */

interface EditState {
  id: number;
  pattern: string;
  action: string;
  categoryName: string;
  ruleType: RuleType;
  userName: string;
}

interface Coverage {
  ruleId: number;
  matches: number;
  wins: number;
  beatenBy: Array<{ ruleId: number; count: number }>;
  conflicts: Array<{ ruleId: number; count: number }>;
  affectedIfDeleted: number;
}

type Issue =
  | { kind: "no-matches" }
  | { kind: "overshadowed"; by: number[] }
  | { kind: "conflict"; with: number[] };

/**
 * Derived, never stored. A rule beaten only by a same-length tie is a
 * conflict, not overshadowed — nothing more specific is winning.
 */
function issuesFor(c: Coverage | undefined): Issue[] {
  if (!c) return [];
  const issues: Issue[] = [];
  if (c.matches === 0) issues.push({ kind: "no-matches" });
  const tied = new Set(c.conflicts.map((x) => x.ruleId));
  const outranking = c.beatenBy.filter((b) => !tied.has(b.ruleId)).map((b) => b.ruleId);
  if (c.matches > 0 && c.wins === 0 && outranking.length > 0) {
    issues.push({ kind: "overshadowed", by: outranking });
  }
  if (c.conflicts.length > 0) {
    issues.push({ kind: "conflict", with: c.conflicts.map((x) => x.ruleId) });
  }
  return issues;
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

interface RulesPanelProps {
  /** Rule to scroll to and highlight (from a line item badge or save notice). */
  focusRuleId?: number | null;
  onFocusRule?: (ruleId: number) => void;
}

export function RulesPanel({ focusRuleId = null, onFocusRule }: RulesPanelProps) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [searchFilter, setSearchFilter] = useState("");
  const [attentionOnly, setAttentionOnly] = useState(false);
  const [editing, setEditing] = useState<EditState | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);

  const rulesQuery = useQuery(trpc.rules.list.queryOptions());
  const coverageQuery = useQuery(trpc.rules.coverage.queryOptions());
  const coverageById = new Map((coverageQuery.data ?? []).map((c) => [c.ruleId, c]));
  const categoriesQuery = useQuery(trpc.categories.list.queryOptions());
  const usersQuery = useQuery(trpc.users.list.queryOptions());

  const getCategoryId = (name: string) =>
    categoriesQuery.data?.find((c) => c.name === name)?.id;

  const getUserId = (name: string) =>
    usersQuery.data?.find((u) => u.name === name)?.id;

  const getUserName = (id: number) =>
    usersQuery.data?.find((u) => u.id === id)?.name ?? "Unknown";

  // pathKey covers list and coverage: any rule change moves both.
  const invalidateRules = () =>
    queryClient.invalidateQueries({ queryKey: trpc.rules.pathKey() });

  const deleteMutation = useMutation(
    trpc.rules.delete.mutationOptions({
      onSuccess: () => {
        invalidateRules();
        setConfirmDeleteId(null);
      },
    })
  );

  const updateMutation = useMutation(
    trpc.rules.update.mutationOptions({
      onSuccess: () => {
        invalidateRules();
        setEditing(null);
      },
    })
  );

  const startEditing = (rule: NonNullable<typeof rulesQuery.data>[number]) => {
    setConfirmDeleteId(null);
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

  const allRules = rulesQuery.data ?? [];
  const ruleById = new Map(allRules.map((r) => [r.id, r]));
  const issuesById = new Map(allRules.map((r) => [r.id, issuesFor(coverageById.get(r.id))]));
  const attentionCount = allRules.filter((r) => issuesById.get(r.id)!.length > 0).length;

  // Jump to the focused rule: clear anything that could hide it.
  const focusedRule = focusRuleId === null ? undefined : ruleById.get(focusRuleId);
  useEffect(() => {
    if (!focusedRule) return;
    setSearchFilter("");
    if ((issuesById.get(focusedRule.id) ?? []).length === 0) setAttentionOnly(false);
  }, [focusedRule?.id]);
  const rowRefs = useRef(new Map<number, HTMLDivElement>());
  useEffect(() => {
    if (focusRuleId === null) return;
    rowRefs.current.get(focusRuleId)?.scrollIntoView({ block: "center" });
  }, [focusRuleId, attentionOnly, rulesQuery.data, coverageQuery.data]);

  const winsOf = (id: number) => coverageById.get(id)?.wins ?? 0;
  const visibleRules = allRules
    .filter((r) => {
      if (attentionOnly && issuesById.get(r.id)!.length === 0) return false;
      // The search box takes a pasted description and shows the rules that
      // would fire for it, so it must use the same matcher the engine does.
      if (searchFilter) return descriptionMatchesPattern(searchFilter, r.pattern);
      return true;
    })
    .sort((a, b) => winsOf(b.id) - winsOf(a.id) || a.pattern.localeCompare(b.pattern));

  const patternOf = (id: number) => (ruleById.get(id)?.pattern ?? `#${id}`).replace(/\s+/g, " ");

  return (
    <div className="min-w-0 space-y-3">
      <div className="flex items-center gap-2">
        <Input
          value={searchFilter}
          onChange={(e) => setSearchFilter(e.target.value)}
          placeholder="Paste a description to see which rules match..."
          className="h-7 text-xs flex-1"
        />
        <Button
          variant={attentionOnly ? "default" : "outline"}
          size="sm"
          className="h-7 shrink-0 gap-1.5 text-xs"
          aria-pressed={attentionOnly}
          disabled={!attentionOnly && attentionCount === 0}
          title="Rules that match nothing, are overshadowed by a more specific rule, or tie with another rule"
          onClick={() => setAttentionOnly((v) => !v)}
        >
          Needs attention
          <span className={attentionOnly ? "" : "text-muted-foreground"}>{attentionCount}</span>
        </Button>
        <span className="text-xs text-muted-foreground shrink-0">
          {plural(visibleRules.length, "rule")}
        </span>
      </div>

      <p className="text-[11px] text-muted-foreground">
        Sorted by the number of stored items each rule decides. Create or update rules from a
        line item in the workspace.
      </p>

      {visibleRules.length > 0 && (
        <div className="space-y-1 max-h-[55vh] overflow-y-auto">
          {visibleRules.map((rule) => {
            const coverage = coverageById.get(rule.id);
            const issues = issuesById.get(rule.id)!;

            if (editing?.id === rule.id) {
              return (
                <div
                  key={rule.id}
                  className="py-1.5 px-2 rounded bg-muted/50 border border-primary/20"
                >
                  <RuleEditForm
                    state={editing}
                    setField={(field, value) =>
                      setEditing((prev) => (prev ? { ...prev, [field]: value } : prev))
                    }
                    onSubmit={handleUpdate}
                    onCancel={() => setEditing(null)}
                    isPending={updateMutation.isPending}
                    categories={categoriesQuery.data ?? []}
                    users={usersQuery.data ?? []}
                  />
                </div>
              );
            }

            return (
              <div
                key={rule.id}
                ref={(el) => {
                  if (el) rowRefs.current.set(rule.id, el);
                  else rowRefs.current.delete(rule.id);
                }}
                className={`rounded bg-muted/50 text-xs ${
                  rule.id === focusRuleId ? "ring-2 ring-inset ring-primary" : ""
                }`}
              >
                <div
                  className="flex items-center justify-between gap-2 py-1 px-2 group cursor-pointer hover:bg-muted rounded"
                  onClick={() => startEditing(rule)}
                >
                  <div className="flex items-center gap-1.5 flex-1 min-w-0">
                    {rule.action && (
                      <Badge
                        variant={rule.action === "reject" ? "destructive" : "default"}
                        className="text-[10px] px-1 py-0 shrink-0"
                      >
                        {rule.action}
                      </Badge>
                    )}
                    <span className="font-mono text-foreground truncate">{rule.pattern}</span>
                    {rule.categoryName && (
                      <>
                        <span className="text-muted-foreground mx-0.5">&rarr;</span>
                        <span className="text-muted-foreground truncate">{rule.categoryName}</span>
                      </>
                    )}
                    <Badge variant="outline" className="text-[10px] px-1 py-0 shrink-0">
                      {rule.ruleType === "personal" && rule.userId
                        ? getUserName(rule.userId)
                        : "split"}
                    </Badge>
                  </div>
                  <span
                    className="shrink-0 text-[10px] tabular-nums text-muted-foreground"
                    title={
                      coverage
                        ? `Decides ${coverage.wins} of the ${coverage.matches} stored items it matches`
                        : undefined
                    }
                  >
                    {coverage ? plural(coverage.wins, "item") : "…"}
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-5 w-5 p-0 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 text-muted-foreground hover:text-destructive shrink-0"
                    aria-label={`Delete rule ${rule.pattern}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      setEditing(null);
                      setConfirmDeleteId(rule.id);
                    }}
                  >
                    x
                  </Button>
                </div>

                {issues.length > 0 && (
                  <div className="flex flex-wrap gap-1 px-2 pb-1">
                    {issues.map((issue) => (
                      <IssueChip
                        key={issue.kind}
                        issue={issue}
                        patternOf={patternOf}
                        onFocusRule={onFocusRule}
                      />
                    ))}
                  </div>
                )}

                {confirmDeleteId === rule.id && (
                  <div className="flex items-center gap-2 border-t px-2 py-1.5">
                    <span className="flex-1">
                      Delete this rule?{" "}
                      {coverage ? (
                        <span className={coverage.affectedIfDeleted > 0 ? "font-medium" : "text-muted-foreground"}>
                          Deleting changes {plural(coverage.affectedIfDeleted, "item")}
                          {coverage.affectedIfDeleted > 0 &&
                            " (on the next import or re-apply, they fall to the next matching rule or none)"}
                          .
                        </span>
                      ) : null}
                    </span>
                    <Button
                      variant="destructive"
                      size="sm"
                      className="h-6 text-xs"
                      disabled={deleteMutation.isPending}
                      onClick={() => deleteMutation.mutate({ id: rule.id })}
                    >
                      Delete
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 text-xs"
                      onClick={() => setConfirmDeleteId(null)}
                    >
                      Cancel
                    </Button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {rulesQuery.data && visibleRules.length === 0 && (
        <p className="py-6 text-center text-xs text-muted-foreground">
          {searchFilter ? "No rule matches that description." : "Nothing needs attention."}
        </p>
      )}
    </div>
  );
}

/** A reason chip; linked rule names jump to that rule. */
function IssueChip({
  issue,
  patternOf,
  onFocusRule,
}: {
  issue: Issue;
  patternOf: (ruleId: number) => string;
  onFocusRule?: (ruleId: number) => void;
}) {
  const base =
    "inline-flex max-w-full items-center gap-1 rounded border border-amber-500/40 bg-amber-500/10 px-1.5 py-px text-[10px] text-amber-800 dark:text-amber-300";

  const links = (ids: number[]) => {
    const shown = ids.slice(0, 2);
    return (
      <>
        {shown.map((id, i) => (
          <span key={id} className="min-w-0 truncate">
            <button
              type="button"
              className="font-mono underline underline-offset-2 hover:no-underline"
              onClick={(e) => {
                e.stopPropagation();
                onFocusRule?.(id);
              }}
            >
              {patternOf(id)}
            </button>
            {i < shown.length - 1 && ","}
          </span>
        ))}
        {ids.length > shown.length && <span>+{ids.length - shown.length} more</span>}
      </>
    );
  };

  switch (issue.kind) {
    case "no-matches":
      return (
        <span
          className={base}
          title="Matches no stored item. Not necessarily wrong — a yearly charge may not have appeared yet"
        >
          No matches
        </span>
      );
    case "overshadowed":
      return (
        <span
          className={base}
          title="Matches items but decides none: a more specific rule wins on every one. This rule does nothing"
        >
          Overshadowed by {links(issue.by)}
        </span>
      );
    case "conflict":
      return (
        <span
          className={base}
          title="Ties a rule of the same type and pattern length on some item; the first-created one wins silently"
        >
          Conflict with {links(issue.with)}
        </span>
      );
  }
}

function RuleEditForm({
  state,
  setField,
  onSubmit,
  onCancel,
  isPending,
  categories,
  users,
}: {
  state: EditState;
  setField: (field: keyof EditState, value: string) => void;
  onSubmit: () => void;
  onCancel: () => void;
  isPending: boolean;
  categories: Array<{ id: number; name: string }>;
  users: Array<{ id: number; name: string }>;
}) {
  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <Input
          value={state.pattern}
          onChange={(e) => setField("pattern", e.target.value)}
          placeholder="Description pattern..."
          className="h-7 text-xs flex-1"
        />
        <Select
          value={state.ruleType}
          onValueChange={(v) => {
            if (v) setField("ruleType", v);
          }}
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
          value={state.action}
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
          value={state.categoryName}
          onValueChange={(v) => {
            if (v) setField("categoryName", v === "__none__" ? "" : v);
          }}
        >
          <SelectTrigger className="h-7 text-xs flex-1">
            <SelectValue placeholder="Category" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__none__">No category</SelectItem>
            {categories.map((cat) => (
              <SelectItem key={cat.id} value={cat.name}>
                {cat.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {state.ruleType === "personal" && (
          <Select
            value={state.userName}
            onValueChange={(v) => {
              if (v) setField("userName", v);
            }}
          >
            <SelectTrigger className="h-7 text-xs w-[100px]">
              <SelectValue placeholder="User" />
            </SelectTrigger>
            <SelectContent>
              {users.map((user) => (
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
            !state.pattern.trim() ||
            (state.action === "none" && !state.categoryName) ||
            (state.ruleType === "personal" && !state.userName) ||
            isPending
          }
        >
          Save
        </Button>
        <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
