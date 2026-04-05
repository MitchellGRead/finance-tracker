import { useState } from "react";
import { useTRPC } from "../lib/trpc";
import { useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Badge } from "./ui/badge";

export function UserManager() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [newName, setNewName] = useState("");

  const usersQuery = useQuery(trpc.users.list.queryOptions());

  const createMutation = useMutation(
    trpc.users.create.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: trpc.users.list.queryKey() });
        setNewName("");
      },
    })
  );

  return (
    <div className="rounded-lg border bg-card p-4 shadow-sm">
      <h3 className="text-sm font-semibold text-foreground mb-3">Users</h3>

      <div className="flex flex-wrap gap-1.5 mb-3">
        {usersQuery.data?.map((user) => (
          <Badge key={user.id} variant="secondary">
            {user.name}
          </Badge>
        ))}
        {usersQuery.data?.length === 0 && (
          <span className="text-xs text-muted-foreground">
            No users yet
          </span>
        )}
      </div>

      <div className="flex gap-2">
        <Input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="Add user..."
          className="h-8 text-sm"
          onKeyDown={(e) => {
            if (e.key === "Enter" && newName.trim()) {
              createMutation.mutate({ name: newName.trim() });
            }
          }}
        />
        <Button
          size="sm"
          className="h-8"
          onClick={() => {
            if (newName.trim()) {
              createMutation.mutate({ name: newName.trim() });
            }
          }}
          disabled={!newName.trim() || createMutation.isPending}
        >
          Add
        </Button>
      </div>
    </div>
  );
}
