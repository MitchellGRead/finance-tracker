import { randomUUID } from "node:crypto";

/**
 * In-memory registry of background suggestion runs.
 *
 * Single process, single operator: a Map is enough. Runs are lost on restart,
 * which is fine — nothing depends on them except a progress indicator, and the
 * suggestions themselves are already in the database.
 */

export interface SuggestionRun {
  runId: string;
  total: number;
  done: number;
  failed: number;
  skipped: number;
  startedAt: string;
  finishedAt: string | null;
  error: string | null;
}

const RETAINED_RUNS = 20;
const runs = new Map<string, SuggestionRun>();

export function createRun(total: number): SuggestionRun {
  const run: SuggestionRun = {
    runId: randomUUID(),
    total,
    done: 0,
    failed: 0,
    skipped: 0,
    startedAt: new Date().toISOString(),
    finishedAt: null,
    error: null,
  };

  runs.set(run.runId, run);
  while (runs.size > RETAINED_RUNS) {
    const oldest = runs.keys().next();
    if (oldest.done) break;
    runs.delete(oldest.value);
  }

  return run;
}

export function getSuggestionRun(runId: string): SuggestionRun | null {
  return runs.get(runId) ?? null;
}

export function finishRun(runId: string, error: string | null = null): void {
  const run = runs.get(runId);
  if (run === undefined) return;
  run.finishedAt = new Date().toISOString();
  run.error = error;
}

/** Test seam. */
export function clearRuns(): void {
  runs.clear();
}
