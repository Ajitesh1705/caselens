// Intel-console vernacular that also does something honest: flags that all case
// data is synthetic and fictional. Encodes truth, not decoration.
export function ClassificationBanner() {
  return (
    <div className="flex items-center justify-center gap-3 border-b border-signal-dim bg-signal-dim/15 py-1">
      <span className="eyebrow text-signal">
        Confidential // Synthetic Data // Fictional Case
      </span>
    </div>
  );
}
