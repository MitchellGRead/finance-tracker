import { useState, useRef, useEffect } from "react";
import { useTRPC } from "../lib/trpc";
import { useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
import { Button } from "./ui/button";
import { Input } from "./ui/input";

interface CategoryPickerProps {
  currentCategoryName: string | null;
  onSelect: (categoryId: number | null) => void;
}

export function CategoryPicker({
  currentCategoryName,
  onSelect,
}: CategoryPickerProps) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [confirmDelete, setConfirmDelete] = useState<number | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  const categoriesQuery = useQuery(trpc.categories.list.queryOptions());
  const categories = categoriesQuery.data ?? [];

  const createMutation = useMutation(
    trpc.categories.create.mutationOptions({
      onSuccess: (created) => {
        queryClient.invalidateQueries({
          queryKey: trpc.categories.list.queryKey(),
        });
        setNewName("");
        onSelect(created.id);
        setOpen(false);
      },
    })
  );

  const deleteMutation = useMutation(
    trpc.categories.delete.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries({
          queryKey: trpc.categories.list.queryKey(),
        });
        setConfirmDelete(null);
      },
    })
  );

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        setConfirmDelete(null);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        className="h-7 w-full text-left text-xs px-1 rounded hover:bg-muted truncate"
        onClick={() => setOpen(!open)}
      >
        {currentCategoryName ?? "—"}
      </button>

      {open && (
        <div className="absolute z-50 top-full left-0 mt-1 min-w-[180px] rounded-lg border bg-popover shadow-md p-1">
          {/* Unassign option */}
          <button
            className={`w-full text-left text-xs px-2 py-1.5 rounded hover:bg-accent ${
              currentCategoryName === null ? "font-semibold" : ""
            }`}
            onClick={() => {
              onSelect(null);
              setOpen(false);
            }}
          >
            —
          </button>

          {/* Category list */}
          {categories.map((cat) => (
            <div
              key={cat.id}
              className="flex items-center group"
            >
              <button
                className={`flex-1 text-left text-xs px-2 py-1.5 rounded hover:bg-accent ${
                  currentCategoryName === cat.name ? "font-semibold" : ""
                }`}
                onClick={() => {
                  onSelect(cat.id);
                  setOpen(false);
                }}
              >
                {cat.name}
              </button>
              {confirmDelete === cat.id ? (
                <div className="flex items-center gap-0.5 pr-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-5 px-1 text-[10px] text-destructive hover:text-destructive"
                    onClick={() => deleteMutation.mutate({ id: cat.id })}
                  >
                    Yes
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-5 px-1 text-[10px]"
                    onClick={() => setConfirmDelete(null)}
                  >
                    No
                  </Button>
                </div>
              ) : (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-5 w-5 p-0 opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive"
                  onClick={() => setConfirmDelete(cat.id)}
                >
                  x
                </Button>
              )}
            </div>
          ))}

          {/* Separator */}
          <div className="h-px bg-border my-1" />

          {/* Create new */}
          <div className="flex gap-1 p-1">
            <Input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="New category..."
              className="h-6 text-[10px] px-1.5 flex-1"
              onKeyDown={(e) => {
                if (e.key === "Enter" && newName.trim()) {
                  createMutation.mutate({ name: newName.trim() });
                }
                e.stopPropagation();
              }}
              onClick={(e) => e.stopPropagation()}
            />
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-1.5 text-[10px]"
              onClick={() => {
                if (newName.trim()) {
                  createMutation.mutate({ name: newName.trim() });
                }
              }}
              disabled={!newName.trim() || createMutation.isPending}
            >
              +
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
