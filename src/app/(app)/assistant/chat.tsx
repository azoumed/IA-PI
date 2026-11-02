"use client";

import { useState } from "react";

type Msg = { role: "user" | "assistant"; content: string };

export function Chat({ labels }: { labels: { placeholder: string; send: string; thinking: string; noKey: string; error: string } }) {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text || busy) return;
    const next = [...messages, { role: "user" as const, content: text }];
    setMessages(next);
    setInput("");
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/assistant", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ messages: next.slice(-20) }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error === "no_api_key" ? labels.noKey : labels.error);
      setMessages([...next, { role: "assistant", content: data.answer }]);
    } catch (err) {
      setError(err instanceof Error ? err.message : labels.error);
      setMessages(messages);
      setInput(text);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex min-h-64 flex-col gap-3">
        {messages.map((m, i) => (
          <div
            key={i}
            dir="auto"
            className={`max-w-[85%] whitespace-pre-wrap rounded-lg px-3 py-2 text-sm ${m.role === "user" ? "self-end bg-primary text-white" : "self-start border border-border bg-background"}`}
          >
            {m.content}
          </div>
        ))}
        {busy && <div className="self-start text-sm text-muted">{labels.thinking}</div>}
      </div>
      {error && <p className="text-sm text-danger">{error}</p>}
      <form onSubmit={send} className="flex gap-2">
        <input value={input} onChange={(e) => setInput(e.target.value)} placeholder={labels.placeholder} dir="auto" />
        <button disabled={busy} className="rounded-md bg-primary px-4 text-sm font-medium text-white disabled:opacity-50">{labels.send}</button>
      </form>
    </div>
  );
}
