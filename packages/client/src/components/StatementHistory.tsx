import { useQuery } from "@tanstack/react-query";
import { useTRPC } from "../lib/trpc";

/**
 * Every statement imported so far. Clicking one jumps to the month it ends in.
 * A statement with no rows left is either an old failed import (before format
 * detection) or one whose months were cleared.
 */

interface StatementHistoryProps {
  onSelectMonth: (month: number, year: number) => void;
}

function formatDate(iso: string, withYear: boolean): string {
  return new Date(`${iso.slice(0, 10)}T00:00:00`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    ...(withYear ? { year: "numeric" } : {}),
  });
}

export function StatementHistory({ onSelectMonth }: StatementHistoryProps) {
  const trpc = useTRPC();
  const historyQuery = useQuery(trpc.statements.history.queryOptions());
  const statements = historyQuery.data ?? [];

  if (historyQuery.isLoading) {
    return <p className="py-6 text-center text-sm text-muted-foreground">Loading…</p>;
  }
  if (statements.length === 0) {
    return (
      <p className="py-6 text-center text-sm text-muted-foreground">
        No statements imported yet.
      </p>
    );
  }

  const totalRows = statements.reduce((sum, s) => sum + s.lineItemCount, 0);

  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground">
        {statements.length} statements · {totalRows} line items. Click one to view
        the month it ends in.
      </p>
      <div className="max-h-[60vh] overflow-y-auto rounded-md border">
        <table className="w-full text-xs">
          <thead className="sticky top-0 bg-muted/80 text-muted-foreground backdrop-blur">
            <tr className="text-left">
              <th className="px-2 py-1.5 font-medium">File</th>
              <th className="px-2 py-1.5 font-medium">User</th>
              <th className="px-2 py-1.5 font-medium">Covers</th>
              <th className="px-2 py-1.5 text-right font-medium">Rows</th>
              <th className="px-2 py-1.5 text-right font-medium">Imported</th>
            </tr>
          </thead>
          <tbody>
            {statements.map((s) => {
              const empty = s.lineItemCount === 0;
              const dateTo = s.dateTo;
              return (
                <tr
                  key={s.id}
                  className={`border-b last:border-0 ${
                    dateTo ? "cursor-pointer hover:bg-muted/50" : ""
                  } ${empty ? "text-muted-foreground" : ""}`}
                  onClick={() =>
                    dateTo &&
                    onSelectMonth(Number(dateTo.slice(5, 7)), Number(dateTo.slice(0, 4)))
                  }
                >
                  <td className="max-w-[220px] px-2 py-1.5">
                    <div className="truncate font-medium" title={s.fileName}>
                      {s.fileName}
                    </div>
                    <div className="text-[10px] uppercase text-muted-foreground">
                      {s.formatProfile ?? s.sourceType}
                    </div>
                  </td>
                  <td className="px-2 py-1.5">{s.userName}</td>
                  <td className="whitespace-nowrap px-2 py-1.5">
                    {s.dateFrom && s.dateTo
                      ? `${formatDate(s.dateFrom, false)} – ${formatDate(s.dateTo, true)}`
                      : "—"}
                  </td>
                  <td className="whitespace-nowrap px-2 py-1.5 text-right tabular-nums">
                    {empty ? (
                      <span
                        className="rounded bg-muted px-1.5 py-0.5 text-[10px]"
                        title="Nothing left from this file: an import that failed before format detection, or its months were cleared"
                      >
                        no rows
                      </span>
                    ) : (
                      <>
                        {s.lineItemCount}
                        {s.rowsSkippedDuplicate ? (
                          <span className="ml-1 text-muted-foreground">
                            (+{s.rowsSkippedDuplicate} dup)
                          </span>
                        ) : null}
                      </>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-2 py-1.5 text-right text-muted-foreground">
                    {formatDate(s.uploadedAt, true)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
