import { useState, useCallback, useRef } from "react";

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

  // Use refs to avoid stale closures when setMonth/setYear are called separately
  const monthRef = useRef(month);
  const yearRef = useRef(year);

  const setMonth = useCallback((m: number | ((prev: number) => number)) => {
    setMonthState((prev) => {
      const next = typeof m === "function" ? m(prev) : m;
      monthRef.current = next;
      updateURL(next, yearRef.current);
      return next;
    });
  }, []);

  const setYear = useCallback((y: number | ((prev: number) => number)) => {
    setYearState((prev) => {
      const next = typeof y === "function" ? y(prev) : y;
      yearRef.current = next;
      updateURL(monthRef.current, next);
      return next;
    });
  }, []);

  // Atomic update for both month and year (avoids stale closure issues)
  const setMonthAndYear = useCallback((m: number, y: number) => {
    setMonthState(m);
    setYearState(y);
    monthRef.current = m;
    yearRef.current = y;
    updateURL(m, y);
  }, []);

  const label = new Date(year, month - 1).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });

  const prev = () => {
    if (month === 1) {
      setMonthAndYear(12, year - 1);
    } else {
      setMonthAndYear(month - 1, year);
    }
  };

  const next = () => {
    if (month === 12) {
      setMonthAndYear(1, year + 1);
    } else {
      setMonthAndYear(month + 1, year);
    }
  };

  return { month, year, label, prev, next, setMonth, setYear, setMonthAndYear };
}
