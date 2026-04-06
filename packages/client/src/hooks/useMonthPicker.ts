import { useState, useCallback } from "react";

function getSearchParams() {
  return new URLSearchParams(window.location.search);
}

function updateURL(month: number, year: number) {
  const params = getSearchParams();
  params.set("month", String(month));
  params.set("year", String(year));
  window.history.replaceState({}, "", `?${params.toString()}`);
}

export function useMonthPicker() {
  const now = new Date();
  const defaultMonth = now.getMonth() === 0 ? 12 : now.getMonth();
  const defaultYear =
    now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear();

  // Read initial values from URL, fall back to defaults
  const params = getSearchParams();
  const initialMonth = params.has("month")
    ? parseInt(params.get("month")!, 10)
    : defaultMonth;
  const initialYear = params.has("year")
    ? parseInt(params.get("year")!, 10)
    : defaultYear;

  const [month, setMonthState] = useState(
    initialMonth >= 1 && initialMonth <= 12 ? initialMonth : defaultMonth
  );
  const [year, setYearState] = useState(
    initialYear >= 2000 && initialYear <= 2100 ? initialYear : defaultYear
  );

  const setMonth = useCallback(
    (m: number | ((prev: number) => number)) => {
      setMonthState((prev) => {
        const next = typeof m === "function" ? m(prev) : m;
        updateURL(next, year);
        return next;
      });
    },
    [year]
  );

  const setYear = useCallback(
    (y: number | ((prev: number) => number)) => {
      setYearState((prev) => {
        const next = typeof y === "function" ? y(prev) : y;
        updateURL(month, next);
        return next;
      });
    },
    [month]
  );

  const label = new Date(year, month - 1).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });

  const prev = () => {
    if (month === 1) {
      const newMonth = 12;
      const newYear = year - 1;
      setMonthState(newMonth);
      setYearState(newYear);
      updateURL(newMonth, newYear);
    } else {
      const newMonth = month - 1;
      setMonthState(newMonth);
      updateURL(newMonth, year);
    }
  };

  const next = () => {
    if (month === 12) {
      const newMonth = 1;
      const newYear = year + 1;
      setMonthState(newMonth);
      setYearState(newYear);
      updateURL(newMonth, newYear);
    } else {
      const newMonth = month + 1;
      setMonthState(newMonth);
      updateURL(newMonth, year);
    }
  };

  return { month, year, label, prev, next, setMonth, setYear };
}
