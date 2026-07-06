// Intel-console vernacular that also does something honest: flags that all case
// data is synthetic and fictional. Encodes truth, not decoration.
export function ClassificationBanner() {
  return (
    <div className="evidence-tape flex items-center justify-center gap-2 border-b border-signal-dim py-1">
      <span className="text-signal" aria-hidden>◆</span>
      <span className="eyebrow text-signal">
        Confidential // Synthetic Data // Fictional Case
      </span>
      <span className="text-signal" aria-hidden>◆</span>
    </div>
  );
}
