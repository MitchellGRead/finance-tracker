import { useState, useCallback, useEffect, useRef } from "react";
import { useTRPC } from "../lib/trpc";
import { useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
import { SourceType } from "@finance-tracker/shared";
import { Button } from "./ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select";
import { AlertTriangle, Sparkles, X } from "lucide-react";

/**
 * Batch statement import. Drop any number of CSVs for any months; each is
 * format-detected and deduped against what is already stored (server-side, see
 * services/importPlan.ts), then previewed before one "Import all".
 */

interface Entry {
  key: string;
  fileName: string;
  content: string;
  /** Null = let the server guess (file name / card member). */
  userId: number | null;
  /** Null = use the detected institution. */
  institution: SourceType | null;
}

const INSTITUTIONS = [SourceType.AMEX, SourceType.TD];

function formatRange(from: string | null, to: string | null): string {
  if (!from || !to) return "—";
  const fmt = (iso: string, withYear: boolean) =>
    new Date(`${iso}T00:00:00`).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      ...(withYear ? { year: "numeric" } : {}),
    });
  return `${fmt(from, false)} – ${fmt(to, true)}`;
}

export function ImportPanel() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  const [entries, setEntries] = useState<Entry[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const usersQuery = useQuery(trpc.users.list.queryOptions());

  // Suggestions run detached on the server after import, so poll the run for
  // progress rather than holding the import mutation open.
  const [suggestionRunId, setSuggestionRunId] = useState<string | null>(null);
  const suggestionRunQuery = useQuery({
    ...trpc.suggestions.runStatus.queryOptions({ runId: suggestionRunId ?? "" }),
    enabled: suggestionRunId !== null,
    refetchInterval: (query) =>
      query.state.data?.finishedAt == null ? 2000 : false,
  });
  const suggestionRun =
    suggestionRunId === null ? null : (suggestionRunQuery.data ?? null);

  // Re-preview whenever the batch or a per-file choice changes. Only the latest
  // request's answer is kept, so a slow earlier preview can't overwrite it.
  const previewMutation = useMutation(trpc.statements.previewImport.mutationOptions());
  const [plans, setPlans] = useState<NonNullable<typeof previewMutation.data>>([]);
  const previewSeq = useRef(0);
  useEffect(() => {
    if (entries.length === 0) {
      setPlans([]);
      return;
    }
    const seq = ++previewSeq.current;
    previewMutation.mutate(
      { files: entries.map(({ key: _key, ...file }) => file) },
      { onSuccess: (data) => seq === previewSeq.current && setPlans(data) }
    );
    // Keyed on entries only: the mutation object's identity changes every
    // render, and depending on it would re-preview in a loop.
  }, [entries]);

  const commitMutation = useMutation(
    trpc.statements.commitImport.mutationOptions({
      onSuccess: (result) => {
        queryClient.invalidateQueries({ queryKey: trpc.lineItems.list.queryKey() });
        queryClient.invalidateQueries({ queryKey: trpc.lineItems.countByMonth.queryKey() });
        queryClient.invalidateQueries({ queryKey: trpc.statements.list.queryKey() });
        if (result.suggestionRunId) setSuggestionRunId(result.suggestionRunId);
        setEntries([]);
      },
    })
  );

  const addFiles = async (newFiles: FileList | File[]) => {
    const csvFiles = Array.from(newFiles).filter((f) =>
      f.name.toLowerCase().endsWith(".csv")
    );
    if (csvFiles.length === 0) return;
    commitMutation.reset();
    const read = await Promise.all(
      csvFiles.map(async (file) => ({
        key: crypto.randomUUID(),
        fileName: file.name,
        content: await file.text(),
        userId: null,
        institution: null,
      }))
    );
    setEntries((prev) => [...prev, ...read]);
  };

  const updateEntry = (key: string, patch: Partial<Entry>) =>
    setEntries((prev) => prev.map((e) => (e.key === key ? { ...e, ...patch } : e)));

  const removeEntry = (key: string) =>
    setEntries((prev) => prev.filter((e) => e.key !== key));

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    void addFiles(e.dataTransfer.files);
  }, []);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) void addFiles(e.target.files);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  // Plans line up with entries by index; a plan for a stale batch is ignored.
  const rows = entries.map((entry, i) => ({
    entry,
    plan: plans.length === entries.length ? plans[i] : undefined,
  }));
  const ready = rows.length > 0 && rows.every((r) => r.plan && r.plan.error === null);
  const totalNew = rows.reduce((sum, r) => sum + (r.plan?.newCount ?? 0), 0);
  const totalDup = rows.reduce((sum, r) => sum + (r.plan?.duplicateCount ?? 0), 0);
  const userName = (id: number | null) =>
    usersQuery.data?.find((u) => u.id === id)?.name ?? "";

  return (
    <div className="space-y-3">
      <div
        className={`relative rounded-md border-2 border-dashed p-4 text-center text-sm transition-colors ${
          dragOver ? "border-primary bg-primary/5" : "border-muted-foreground/25"
        }`}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
      >
        <label className="cursor-pointer text-muted-foreground">
          Drop statement CSVs here — any months, any accounts — or{" "}
          <span className="text-primary underline">browse</span>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv"
            multiple
            className="hidden"
            onChange={handleFileSelect}
          />
        </label>
        <p className="mt-1 text-xs text-muted-foreground">
          Overlapping days between statements are skipped automatically.
        </p>
      </div>

      {rows.length > 0 && (
        <div className="max-h-[50vh] overflow-y-auto rounded-md border">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-muted/80 text-muted-foreground backdrop-blur">
              <tr className="text-left">
                <th className="px-2 py-1.5 font-medium">File</th>
                <th className="px-2 py-1.5 font-medium">Institution</th>
                <th className="px-2 py-1.5 font-medium">User</th>
                <th className="px-2 py-1.5 font-medium">Dates</th>
                <th className="px-2 py-1.5 text-right font-medium">New</th>
                <th className="px-2 py-1.5 text-right font-medium">Dupes</th>
                <th className="w-6" />
              </tr>
            </thead>
            <tbody>
              {rows.map(({ entry, plan }) => {
                const institution = entry.institution ?? plan?.detectedInstitution ?? null;
                const userId = entry.userId ?? plan?.userId ?? null;
                const nearDuplicates = plan?.nearDuplicates ?? [];
                const warnings = nearDuplicates.length;
                const skipped = plan?.skipped.length ?? 0;
                const isOpen = expanded === entry.key;
                return (
                  <FileRow
                    key={entry.key}
                    cells={
                      <>
                        <td className="max-w-[180px] px-2 py-1.5">
                          <div className="truncate font-medium" title={entry.fileName}>
                            {entry.fileName}
                          </div>
                          {plan?.profile && (
                            <div className="text-[10px] text-muted-foreground">
                              {plan.profile}
                              {skipped > 0 && ` · ${skipped} row${skipped === 1 ? "" : "s"} unreadable`}
                            </div>
                          )}
                        </td>
                        <td className="px-2 py-1.5">
                          <Select
                            value={institution ?? ""}
                            onValueChange={(v) => {
                              if (v) updateEntry(entry.key, { institution: v as SourceType });
                            }}
                          >
                            <SelectTrigger className="h-7 w-20 text-xs uppercase">
                              <SelectValue placeholder="—" />
                            </SelectTrigger>
                            <SelectContent>
                              {INSTITUTIONS.map((inst) => (
                                <SelectItem key={inst} value={inst} className="uppercase">
                                  {inst}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </td>
                        <td className="px-2 py-1.5">
                          <Select
                            value={userName(userId)}
                            onValueChange={(v) => {
                              const id = usersQuery.data?.find((u) => u.name === v)?.id;
                              if (id !== undefined) updateEntry(entry.key, { userId: id });
                            }}
                          >
                            <SelectTrigger className="h-7 w-24 text-xs">
                              <SelectValue placeholder="Who?" />
                            </SelectTrigger>
                            <SelectContent>
                              {usersQuery.data?.map((user) => (
                                <SelectItem key={user.id} value={user.name}>
                                  {user.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </td>
                        <td className="whitespace-nowrap px-2 py-1.5 text-muted-foreground">
                          {plan ? formatRange(plan.dateFrom, plan.dateTo) : "…"}
                        </td>
                        <td className="px-2 py-1.5 text-right font-medium tabular-nums">
                          {plan && plan.error === null ? `+${plan.newCount}` : ""}
                        </td>
                        <td className="px-2 py-1.5 text-right tabular-nums text-muted-foreground">
                          {plan && plan.error === null ? plan.duplicateCount : ""}
                        </td>
                        <td className="px-1 py-1.5">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive"
                            onClick={() => removeEntry(entry.key)}
                            aria-label={`Remove ${entry.fileName}`}
                          >
                            <X className="h-3.5 w-3.5" />
                          </Button>
                        </td>
                      </>
                    }
                    detail={
                      plan?.error ? (
                        <span className="text-destructive">{plan.error}</span>
                      ) : warnings > 0 ? (
                        <div>
                          <button
                            className="flex items-center gap-1 text-amber-700 hover:underline"
                            onClick={() => setExpanded(isOpen ? null : entry.key)}
                          >
                            <AlertTriangle className="h-3 w-3" />
                            {warnings} possible duplicate{warnings === 1 ? "" : "s"} — imported
                            anyway, review after
                          </button>
                          {isOpen && (
                            <ul className="mt-1 space-y-0.5 pl-4 text-muted-foreground">
                              {nearDuplicates.map((n, i) => (
                                <li key={i}>
                                  {n.incoming.date} {n.incoming.description} $
                                  {n.incoming.amount.toFixed(2)} looks like stored{" "}
                                  {n.existing.date} {n.existing.description}
                                </li>
                              ))}
                            </ul>
                          )}
                        </div>
                      ) : null
                    }
                  />
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {suggestionRun != null && (
        <div className="flex items-center gap-2 rounded-md border border-cyan-300 bg-cyan-50 px-2 py-1.5 text-xs text-cyan-700">
          <Sparkles
            className={`h-3 w-3 ${suggestionRun.finishedAt === null ? "animate-pulse" : ""}`}
            aria-hidden
          />
          {suggestionRun.finishedAt === null ? (
            <span>
              Jev is reviewing {suggestionRun.total} item
              {suggestionRun.total === 1 ? "" : "s"} — {suggestionRun.done} done
            </span>
          ) : (
            <span>
              Jev suggested {suggestionRun.done} of {suggestionRun.total} items
              {suggestionRun.failed > 0 && ` (${suggestionRun.failed} failed)`}
              {suggestionRun.error !== null && ` — ${suggestionRun.error}`}
            </span>
          )}
        </div>
      )}

      {commitMutation.isSuccess && (
        <p className="text-xs text-muted-foreground">
          Imported {commitMutation.data.inserted} new item
          {commitMutation.data.inserted === 1 ? "" : "s"} from{" "}
          {commitMutation.data.files.length} file
          {commitMutation.data.files.length === 1 ? "" : "s"}; skipped{" "}
          {commitMutation.data.files.reduce((s, f) => s + f.duplicateCount, 0)} duplicates.{" "}
          Rules matched {commitMutation.data.rulesApplied}.
        </p>
      )}

      {rows.length > 0 && (
        <div className="flex items-center justify-between gap-3">
          <span className="text-xs text-muted-foreground">
            {previewMutation.isPending
              ? "Checking files…"
              : `${rows.length} file${rows.length === 1 ? "" : "s"} · ${totalNew} new · ${totalDup} duplicates skipped`}
          </span>
          <div className="flex gap-2">
            <Button
              variant="ghost"
              size="sm"
              className="h-8 text-xs"
              onClick={() => setEntries([])}
            >
              Clear
            </Button>
            <Button
              size="sm"
              className="h-8 text-sm"
              onClick={() =>
                commitMutation.mutate({
                  files: entries.map(({ key: _key, ...file }) => file),
                })
              }
              disabled={!ready || previewMutation.isPending || commitMutation.isPending}
            >
              {commitMutation.isPending
                ? "Importing…"
                : `Import all (${totalNew} new)`}
            </Button>
          </div>
        </div>
      )}

      {(previewMutation.isError || commitMutation.isError) && (
        <p className="text-xs text-destructive">
          {(commitMutation.error ?? previewMutation.error)?.message}
        </p>
      )}
    </div>
  );
}

function FileRow({ cells, detail }: { cells: React.ReactNode; detail: React.ReactNode }) {
  return (
    <>
      <tr className={detail ? "" : "border-b last:border-0"}>{cells}</tr>
      {detail && (
        <tr className="border-b last:border-0">
          <td colSpan={7} className="px-2 pb-1.5 text-xs">
            {detail}
          </td>
        </tr>
      )}
    </>
  );
}
