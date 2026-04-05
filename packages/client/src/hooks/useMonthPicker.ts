import { useState } from "react";

export function useMonthPicker() {
  const now = new Date();
  // Default to previous month (typical use case: importing last month's data)
  const defaultMonth = now.getMonth() === 0 ? 12 : now.getMonth();
  const defaultYear =
    now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear();

  const [month, setMonth] = useState(defaultMonth);
  const [year, setYear] = useState(defaultYear);

  const label = new Date(year, month - 1).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });

  const prev = () => {
    if (month === 1) {
      setMonth(12);
      setYear((y) => y - 1);
    } else {
      setMonth((m) => m - 1);
    }
  };

  const next = () => {
    if (month === 12) {
      setMonth(1);
      setYear((y) => y + 1);
    } else {
      setMonth((m) => m + 1);
    }
  };

  return { month, year, label, prev, next, setMonth, setYear };
}
