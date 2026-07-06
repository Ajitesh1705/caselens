import { useEffect, useRef, useState } from "react";
import type { EvidenceCitation } from "@caselens/shared";
import { getSocket } from "../lib/socket";
import { useCaseStore } from "../store/useCaseStore";

interface Msg {
  role: "user" | "assistant";
  text: string;
  citations?: EvidenceCitation[];
  streaming?: boolean;
}

const SUGGESTIONS = [
  "Summarize all contact between R. Mehta and the offshore account",
  "Who transacted on 2026-03-04?",
];

// Ask-the-Case: questions stream token-by-token over the same WebSocket, then
// resolve with clickable evidence citations.
export function AskPanel({ caseId }: { caseId: string }) {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const setTab = useCaseStore((s) => s.setTab);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const socket = getSocket();
    const onToken = ({ token }: { token: string }) => {
      setMessages((m) => {
        const last = m[m.length - 1];
        if (!last || last.role !== "assistant") return m;
        return [...m.slice(0, -1), { ...last, text: last.text + token }];
      });
    };
    const onDone = ({ citations }: { answer: string; citations: EvidenceCitation[] }) => {
      setMessages((m) => {
        const last = m[m.length - 1];
        if (!last || last.role !== "assistant") return m;
        return [...m.slice(0, -1), { ...last, citations, streaming: false }];
      });
      setBusy(false);
    };
    const onError = ({ message }: { message: string }) => {
      setMessages((m) => [...m, { role: "assistant", text: `Error: ${message}` }]);
      setBusy(false);
    };
    socket.on("chat:token", onToken);
    socket.on("chat:done", onDone);
    socket.on("chat:error", onError);
    return () => {
      socket.off("chat:token", onToken);
      socket.off("chat:done", onDone);
      socket.off("chat:error", onError);
    };
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages]);

  function ask(question: string) {
    const q = question.trim();
    if (!q || busy) return;
    setMessages((m) => [
      ...m,
      { role: "user", text: q },
      { role: "assistant", text: "", streaming: true },
    ]);
    setInput("");
    setBusy(true);
    getSocket().emit("chat:ask", { caseId, question: q });
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="border-b px-3 py-2">
        <span className="eyebrow">Ask the Case</span>
      </div>
      <div ref={scrollRef} className="min-h-0 flex-1 space-y-3 overflow-y-auto px-3 py-3">
        {messages.length === 0 && (
          <div className="space-y-2">
            <p className="eyebrow">Ask a question grounded in the evidence:</p>
            {SUGGESTIONS.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => ask(s)}
                className="block w-full rounded-sm border bg-panel-2 px-2 py-1.5 text-left text-xs text-text/80 hover:border-signal"
              >
                {s}
              </button>
            ))}
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={m.role === "user" ? "text-right" : ""}>
            <div
              className={`inline-block max-w-[90%] whitespace-pre-wrap rounded-sm border px-2.5 py-1.5 text-xs leading-relaxed ${
                m.role === "user" ? "bg-signal/10 text-text" : "bg-panel-2 text-text/90"
              }`}
            >
              {m.text || (m.streaming ? "…" : "")}
              {m.streaming && <span className="ml-0.5 animate-pulse">▊</span>}
            </div>
            {m.citations && m.citations.length > 0 && (
              <div className="mt-1.5 flex flex-wrap gap-1">
                {m.citations.map((c) => (
                  <button
                    key={c.evidenceId}
                    type="button"
                    onClick={() => setTab("search")}
                    title={c.snippet}
                    className="mono rounded-sm border px-1.5 py-0.5 text-[10px] text-signal hover:bg-signal/10"
                  >
                    ▤ {c.filename}
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          ask(input);
        }}
        className="flex gap-2 border-t px-3 py-2"
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask the case…"
          className="mono flex-1 rounded-sm border bg-panel-2 px-2 py-1.5 text-sm text-text placeholder:text-muted focus:border-signal"
        />
        <button
          type="submit"
          disabled={busy}
          className="rounded-sm border border-signal bg-signal/15 px-3 py-1 text-sm text-signal disabled:opacity-40"
        >
          Ask
        </button>
      </form>
    </div>
  );
}
