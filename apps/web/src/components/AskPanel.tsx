import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import type { EvidenceCitation } from "@caselens/shared";
import { getSocket } from "../lib/socket";
import { useCaseStore } from "../store/useCaseStore";

// Markdown styling for the AI "Analysis" card — warm/on-theme (ochre + ink).
const MD_CLASS =
  "space-y-1.5 [&_a]:text-signal [&_a]:underline [&_code]:mono [&_code]:rounded-sm [&_code]:bg-panel [&_code]:px-1 [&_code]:text-signal [&_h1]:serif [&_h1]:text-sm [&_h1]:font-semibold [&_h1]:text-text [&_h2]:serif [&_h2]:mt-2 [&_h2]:text-signal [&_li]:ml-4 [&_li]:list-disc [&_li]:marker:text-signal [&_p]:leading-relaxed [&_strong]:font-semibold [&_ul]:space-y-0.5";

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

const chatKey = (caseId: string) => `caselens.chat.${caseId}`;

function loadChat(caseId: string): Msg[] {
  try {
    const raw = localStorage.getItem(chatKey(caseId));
    if (!raw) return [];
    // Never restore a stuck "streaming" flag from a mid-stream reload.
    return (JSON.parse(raw) as Msg[]).map((m) => ({ ...m, streaming: false }));
  } catch {
    return [];
  }
}

function saveChat(caseId: string, msgs: Msg[]) {
  try {
    if (msgs.length === 0) localStorage.removeItem(chatKey(caseId));
    else localStorage.setItem(chatKey(caseId), JSON.stringify(msgs));
  } catch {
    /* ignore quota / private-mode errors */
  }
}

// Ask-the-Case: questions stream token-by-token over the WebSocket, resolve with
// clickable citations. Conversations persist per case in localStorage.
export function AskPanel({ caseId }: { caseId: string }) {
  const [prevCase, setPrevCase] = useState(caseId);
  const [messages, setMessages] = useState<Msg[]>(() => loadChat(caseId));
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const setTab = useCaseStore((s) => s.setTab);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Reload the conversation when the active case changes (derive-from-props).
  if (caseId !== prevCase) {
    setPrevCase(caseId);
    setMessages(loadChat(caseId));
    setBusy(false);
  }

  // Persist once the tail message is settled (not mid-stream).
  useEffect(() => {
    if (messages.at(-1)?.streaming) return;
    saveChat(caseId, messages);
  }, [caseId, messages]);

  useEffect(() => {
    const socket = getSocket();
    const onToken = ({ token }: { token: string }) => {
      setMessages((m) => {
        const last = m.at(-1);
        if (last?.role !== "assistant") return m;
        return [...m.slice(0, -1), { ...last, text: last.text + token }];
      });
    };
    const onDone = ({ citations }: { answer: string; citations: EvidenceCitation[] }) => {
      setMessages((m) => {
        const last = m.at(-1);
        if (last?.role !== "assistant") return m;
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

  function clearChat() {
    setMessages([]);
    saveChat(caseId, []);
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center justify-between border-b px-3 py-2">
        <span className="eyebrow">Ask the Case</span>
        {messages.length > 0 && (
          <button
            type="button"
            onClick={clearChat}
            className="mono text-[10px] uppercase tracking-wider text-muted hover:text-signal"
            title="Clear conversation"
          >
            ✕ Clear
          </button>
        )}
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

        {messages.map((m, i) =>
          m.role === "user" ? (
            <div key={i} className="text-right">
              <div className="inline-block max-w-[92%] whitespace-pre-wrap rounded-sm border border-signal/40 bg-signal/10 px-2.5 py-1.5 text-left text-xs leading-relaxed text-text">
                {m.text}
              </div>
            </div>
          ) : (
            // AI "Analysis" card — warm, on-theme: recessed cream, ochre left rule,
            // serif italic label. Distinct from evidence, harmonious with it.
            <div
              key={i}
              className="rounded-md border border-l-2 border-l-signal bg-panel-2/60 shadow-sm"
            >
              <div className="flex items-center gap-1.5 border-b border-line/60 px-2.5 py-1.5">
                <span className="text-signal" aria-hidden>
                  ◆
                </span>
                <span className="serif text-xs italic text-muted">Analysis</span>
                {m.streaming && (
                  <span className="mono text-[10px] text-muted">· reasoning</span>
                )}
              </div>
              <div className="px-2.5 py-2 text-xs text-text/90">
                <div className={MD_CLASS}>
                  <ReactMarkdown>{m.text || (m.streaming ? "…" : "")}</ReactMarkdown>
                  {m.streaming && <span className="ml-0.5 animate-pulse text-signal">▊</span>}
                </div>
                {m.citations && m.citations.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1 border-t border-line/60 pt-2">
                    {m.citations.map((c) => (
                      <button
                        key={c.evidenceId}
                        type="button"
                        onClick={() => setTab("search")}
                        title={c.snippet}
                        className="mono rounded-sm border border-signal/40 px-1.5 py-0.5 text-[10px] text-signal hover:bg-signal/10"
                      >
                        ▤ {c.filename}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ),
        )}
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
