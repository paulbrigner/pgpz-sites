export function ReferenceMark({ compact = false }: { compact?: boolean }) {
  return (
    <span
      className={compact ? "reference-mark reference-mark--compact" : "reference-mark"}
      aria-hidden="true"
    >
      <span>R</span>
    </span>
  );
}
