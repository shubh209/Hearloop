"use client";

type Props = {
  value: string;
  onChange: (value: string) => void;
};

export function BusinessContextField({ value, onChange }: Props) {
  return (
    <>
      <label style={{ fontSize: 11, fontWeight: 500, color: "var(--ink-3)" }}>
        Business description
      </label>
      <textarea
        style={{
          width: "100%",
          marginTop: 6,
          minHeight: 120,
          padding: "10px 12px",
          borderRadius: 8,
          border: "0.5px solid var(--paper-3)",
          fontSize: 13,
          resize: "vertical",
        }}
        placeholder="What does your business do? What do customers usually visit for?"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </>
  );
}
