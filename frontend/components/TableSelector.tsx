"use client";

type Props = {
  selected: number[];
  onChange: (tables: number[]) => void;
  locked?: number[];
  label?: string;
  allowEmpty?: boolean;
};

export function TableSelector({ selected, onChange, locked = [], label = "Select times tables", allowEmpty = false }: Props) {
  function toggle(table: number) {
    if (locked.includes(table)) return;
    if (selected.includes(table)) {
      if (selected.length === 1 && !allowEmpty) return;
      onChange(selected.filter((item) => item !== table));
    } else {
      onChange([...selected, table].sort((a, b) => a - b));
    }
  }

  return (
    <div className="tableGrid" aria-label={label}>
      {Array.from({ length: 11 }, (_, index) => index + 2).map((table) => (
        <button
          key={table}
          className={`tableButton ${selected.includes(table) ? "selected" : ""} ${locked.includes(table) ? "locked" : ""}`}
          onClick={() => toggle(table)}
          disabled={locked.includes(table) || (!allowEmpty && selected.includes(table) && selected.length === 1)}
          aria-pressed={selected.includes(table)}
          aria-label={locked.includes(table) ? `${table} times table, required by admin` : `${table} times table`}
          title={locked.includes(table) ? "Required by admin" : undefined}
          type="button"
        >
          <span>{table}</span>
          {locked.includes(table) && <small>Required</small>}
        </button>
      ))}
    </div>
  );
}
