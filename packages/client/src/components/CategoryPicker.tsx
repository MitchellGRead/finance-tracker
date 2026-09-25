import { useState, useRef, useEffect, type ReactNode } from "react";
import { useTRPC } from "../lib/trpc";
import { useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Sparkles } from "lucide-react";

const MOST_USED_COUNT = 5;

export interface SuggestedCategory {
  categoryId: number;
  categoryName: string;
  confidence: number | null;
}

interface CategoryPickerProps {
  currentCategoryName?: string | null;
  onSelect: (categoryId: number | null) => void;
  /**
   * `close` is passed through so a trigger can render its own accept control
   * inside the picker's ref — anything outside it would register as an outside
   * click and close the popover mid-click.
   */
  trigger?: (props: {
    open: boolean;
    toggle: () => void;
    close: () => void;
  }) => ReactNode;
  /** Jev's suggestion, surfaced as its own section at the top of the list. */
  suggested?: SuggestedCategory | null;
  onAcceptSuggestion?: () => void;
}

export function CategoryPicker({
  currentCategoryName = null,
  onSelect,
  trigger,
  suggested = null,
  onAcceptSuggestion,
}: CategoryPickerProps) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [confirmDelete, setConfirmDelete] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  const categoriesQuery = useQuery(trpc.categories.list.queryOptions());
  const categories = categoriesQuery.data ?? [];

  const usageQuery = useQuery(trpc.categories.usageCounts.queryOptions());
  const usageCounts = usageQuery.data ?? [];

  const close = () => {
    setOpen(false);
    setConfirmDelete(null);
    setSearch("");
  };

  const createMutation = useMutation(
    trpc.categories.create.mutationOptions({
      onSuccess: (created) => {
        queryClient.invalidateQueries({
          queryKey: trpc.categories.list.queryKey(),
        });
        setNewName("");
        onSelect(created.id);
        close();
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
        close();
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  // Compute most-used and filtered lists
  const countMap = new Map(
    usageCounts.map((u) => [u.categoryId, Number(u.count)])
  );

  const topIds = new Set(
    [...countMap.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, MOST_USED_COUNT)
      .map(([id]) => id)
  );

  const filtered = categories.filter((cat) =>
    cat.name.toLowerCase().includes(search.toLowerCase())
  );

  const mostUsed = filtered.filter((cat) => topIds.has(cat.id));
  const rest = filtered.filter((cat) => !topIds.has(cat.id));

  const renderCategoryItem = (cat: { id: number; name: string }) => (
    <div key={cat.id} className="flex items-center group">
      <button
        className={`flex-1 text-left text-xs px-2 py-1.5 rounded hover:bg-accent ${
          currentCategoryName === cat.name ? "font-semibold" : ""
        }`}
        onClick={() => {
          onSelect(cat.id);
          close();
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
  );

  const acceptSuggestion = () => {
    if (suggested === null) return;
    if (onAcceptSuggestion) onAcceptSuggestion();
    else onSelect(suggested.categoryId);
    close();
  };

  const toggle = () => (open ? close() : setOpen(true));

  return (
    <div ref={ref} className="relative">
      {trigger ? (
        trigger({ open, toggle, close })
      ) : (
        <button
          className="h-7 w-full text-left text-xs px-1 rounded hover:bg-muted truncate"
          onClick={toggle}
        >
          {currentCategoryName ?? "—"}
        </button>
      )}

      {open && (
        <div className="absolute z-50 top-full left-0 mt-1 min-w-[180px] rounded-lg border bg-popover shadow-md p-1">
          {/* Search */}
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search categories..."
            className="h-6 text-[10px] px-1.5 mb-1"
            autoFocus
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === "Enter" && !search && suggested) acceptSuggestion();
            }}
            onClick={(e) => e.stopPropagation()}
          />

          <div className="max-h-[300px] overflow-y-auto">
            {/* Jev's suggestion — hide when searching, same as the unassign row */}
            {!search && suggested && (
              <>
                <div className="text-[10px] text-cyan-600 px-2 pt-1 pb-0.5">
                  Suggested by Jev
                </div>
                <button
                  className="w-full flex items-center gap-1 text-left text-xs px-2 py-1.5 rounded border border-dashed border-cyan-300 text-cyan-700 hover:bg-cyan-50"
                  onClick={acceptSuggestion}
                  title={
                    suggested.confidence === null
                      ? `Apply Jev's suggestion: ${suggested.categoryName}`
                      : `Apply Jev's suggestion: ${suggested.categoryName} (${Math.round(
                          suggested.confidence * 100
                        )}% confidence)`
                  }
                >
                  <Sparkles className="h-3 w-3 shrink-0" aria-hidden />
                  <span className="flex-1 truncate">{suggested.categoryName}</span>
                  {suggested.confidence !== null && (
                    <span className="text-[10px] text-cyan-600/70 tabular-nums">
                      {Math.round(suggested.confidence * 100)}%
                    </span>
                  )}
                </button>
                <div className="h-px bg-border my-1" />
              </>
            )}

            {/* Unassign option — hide when searching */}
            {!search && (
              <button
                className={`w-full text-left text-xs px-2 py-1.5 rounded hover:bg-accent ${
                  currentCategoryName === null ? "font-semibold" : ""
                }`}
                onClick={() => {
                  onSelect(null);
                  close();
                }}
              >
                —
              </button>
            )}

            {/* Most used section */}
            {mostUsed.length > 0 && (
              <>
                <div className="text-[10px] text-muted-foreground px-2 pt-1 pb-0.5">
                  Most used
                </div>
                {mostUsed.map(renderCategoryItem)}
                {rest.length > 0 && <div className="h-px bg-border my-1" />}
              </>
            )}

            {/* Remaining categories */}
            {rest.map(renderCategoryItem)}
          </div>

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
