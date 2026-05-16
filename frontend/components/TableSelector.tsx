"use client";

type Props = {
  selected: number[];
  onChange: (tables: number[]) => void;
};

export function TableSelector({ selected, onChange }: Props) {
  function toggle(table: number) {
    if (selected.includes(table)) {
      onChange(selected.filter((item) => item !== table));
    } else {
      onChange([...selected, table].sort((a, b) => a - b));
    }
  }

  return (
    <div className="tableGrid" aria-label="Select times tables">
      {Array.from({ length: 11 }, (_, index) => index + 2).map((table) => (
        <button
          key={table}
          className={`tableButton ${selected.includes(table) ? "selected" : ""}`}
          onClick={() => toggle(table)}
          type="button"
        >
          {table}
        </button>
      ))}
    </div>
  );
}
