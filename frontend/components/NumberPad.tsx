"use client";

export function NumberPad({ onPress, disabled = false }: { onPress: (key: string) => void; disabled?: boolean }) {
  return (
    <div className="numberPad" aria-label="Number pad">
      {["1", "2", "3", "4", "5", "6", "7", "8", "9", "clear", "0", "backspace"].map((key) => (
        <button
          key={key}
          type="button"
          className={key.length > 1 ? "utility" : ""}
          onClick={() => onPress(key)}
          disabled={disabled}
          aria-label={key === "backspace" ? "Delete last digit" : key === "clear" ? "Clear answer" : key}
        >
          {key === "backspace" ? "⌫" : key === "clear" ? "Clear" : key}
        </button>
      ))}
      <button type="button" className="enter" onClick={() => onPress("enter")} disabled={disabled}>
        Enter
      </button>
    </div>
  );
}
