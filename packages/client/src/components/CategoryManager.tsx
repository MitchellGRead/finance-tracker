import { useState } from "react";
import { useTRPC } from "../lib/trpc";
import { useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Badge } from "./ui/badge";

export function CategoryManager() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [newName, setNewName] = useState("");

  const categoriesQuery = useQuery(trpc.categories.list.queryOptions());

  const createMutation = useMutation(
    trpc.categories.create.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries({
          queryKey: trpc.categories.list.queryKey(),
        });
        setNewName("");
      },
    })
  );

  const deleteMutation = useMutation(
    trpc.categories.delete.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries({
          queryKey: trpc.categories.list.queryKey(),
        });
      },
    })
  );

  return (
    <div className="rounded-lg border bg-card p-4 shadow-sm">
      <h3 className="text-sm font-semibold text-foreground mb-3">Categories</h3>

      <div className="flex flex-wrap gap-1.5 mb-3">
        {categoriesQuery.data?.map((cat) => (
          <Badge
            key={cat.id}
            variant="secondary"
            className="cursor-pointer group"
            onClick={() => deleteMutation.mutate({ id: cat.id })}
          >
            {cat.name}
            <span className="ml-1 opacity-0 group-hover:opacity-100 transition-opacity">
              x
            </span>
          </Badge>
        ))}
        {categoriesQuery.data?.length === 0 && (
          <span className="text-xs text-muted-foreground">
            No categories yet
          </span>
        )}
      </div>

      <div className="flex gap-2">
        <Input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="Add category..."
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
