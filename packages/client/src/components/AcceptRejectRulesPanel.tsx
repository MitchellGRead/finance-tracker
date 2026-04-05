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

export function AcceptRejectRulesPanel() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [pattern, setPattern] = useState("");
  const [action, setAction] = useState<"accept" | "reject">("reject");
  const [userId, setUserId] = useState<string>("");
  const [expanded, setExpanded] = useState(false);

  const rulesQuery = useQuery(trpc.acceptRejectRules.list.queryOptions());
  const usersQuery = useQuery(trpc.users.list.queryOptions());

  const createMutation = useMutation(
    trpc.acceptRejectRules.create.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries({
          queryKey: trpc.acceptRejectRules.list.queryKey(),
        });
        setPattern("");
      },
    })
  );

  const deleteMutation = useMutation(
    trpc.acceptRejectRules.delete.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries({
          queryKey: trpc.acceptRejectRules.list.queryKey(),
        });
      },
    })
  );

  const handleCreate = () => {
    if (!pattern.trim() || !userId) return;
    createMutation.mutate({
      userId: parseInt(userId.replace("user-", "")),
      pattern: pattern.trim(),
      action,
    });
  };

  const getUserName = (id: number) =>
    usersQuery.data?.find((u) => u.id === id)?.name ?? "Unknown";

  return (
    <div className="rounded-lg border bg-card p-4 shadow-sm">
      <button
        className="flex w-full items-center justify-between text-sm font-semibold text-foreground"
        onClick={() => setExpanded(!expanded)}
      >
        <span>Accept/Reject Rules</span>
        <span className="text-xs text-muted-foreground">
          {rulesQuery.data?.length ?? 0} rules {expanded ? "▾" : "▸"}
        </span>
      </button>

      {expanded && (
        <div className="mt-3 space-y-3">
          {rulesQuery.data && rulesQuery.data.length > 0 && (
            <div className="space-y-1 max-h-[200px] overflow-y-auto">
              {rulesQuery.data.map((rule) => (
                <div
                  key={rule.id}
                  className="flex items-center justify-between text-xs py-1 px-2 rounded bg-muted/50 group"
                >
                  <div className="flex items-center gap-1.5 flex-1 min-w-0">
                    <Badge
                      variant={
                        rule.action === "reject" ? "destructive" : "default"
                      }
                      className="text-[10px] px-1 py-0"
                    >
                      {rule.action}
                    </Badge>
                    <span className="font-mono text-foreground">
                      {rule.pattern}
                    </span>
                    <span className="text-muted-foreground">
                      ({getUserName(rule.userId)})
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

          <div className="space-y-2">
            <Input
              value={pattern}
              onChange={(e) => setPattern(e.target.value)}
              placeholder="Description pattern..."
              className="h-7 text-xs"
            />
            <div className="flex gap-2">
              <Select
                value={userId}
                onValueChange={(v) => { if (v) setUserId(v); }}
              >
                <SelectTrigger className="h-7 text-xs flex-1">
                  <SelectValue placeholder="User" />
                </SelectTrigger>
                <SelectContent>
                  {usersQuery.data?.map((user) => (
                    <SelectItem key={user.id} value={`user-${user.id}`}>
                      {user.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select
                value={action}
                onValueChange={(v) => {
                  if (v) setAction(v as "accept" | "reject");
                }}
              >
                <SelectTrigger className="h-7 text-xs w-[90px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="accept">Accept</SelectItem>
                  <SelectItem value="reject">Reject</SelectItem>
                </SelectContent>
              </Select>
              <Button
                size="sm"
                className="h-7 text-xs"
                onClick={handleCreate}
                disabled={
                  !pattern.trim() || !userId || createMutation.isPending
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
