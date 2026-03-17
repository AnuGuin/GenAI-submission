"use client";
import { useState } from "react";
import { Zap, Code2, ChevronRight, Loader2 } from "lucide-react";
import { Streamdown } from "streamdown";

const EXAMPLES = [
  "Explain how black holes form",
  "What is the difference between RAM and storage?",
  "How do I stay focused while working from home?",
  "What causes inflation?",
];

async function* streamSSE(url: string, body: object) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const reader = res.body!.getReader();
  const dec = new TextDecoder();
  let buf = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    const lines = buf.split("\n");
    buf = lines.pop() || "";
    for (const line of lines) {
      if (line.startsWith("data: ") && !line.includes("[DONE]")) {
        try { yield JSON.parse(line.slice(6)); } catch {}
      }
    }
  }
}

export default function EasyPanel() {
  const [query, setQuery] = useState("");
  const [rawText, setRawText] = useState("");
  const [engText, setEngText] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPrompt, setShowPrompt] = useState(false);
  const [systemPrompt, setSystemPrompt] = useState("");

  const run = async () => {
    if (!query.trim()) return;
    setLoading(true);
    setRawText("");
    setEngText("");

    // Fetch system prompt for display
    const sp = await fetch("/api/easy/system-prompt").then(r => r.json());
    setSystemPrompt(sp.engineered);

    // Stream both in parallel
    const doStream = async (mode: "raw" | "engineered", setter: React.Dispatch<React.SetStateAction<string>>) => {
      for await (const chunk of streamSSE("/api/easy/generate", { query, mode })) {
        setter(prev => prev + (chunk.text || ""));
      }
    };

    await Promise.all([
      doStream("raw", setRawText),
      doStream("engineered", setEngText),
    ]);
    setLoading(false);
  };

  return (
    <div className="animate-slide-up space-y-6">
      {/* Problem statement */}
      <div className="bg-card rounded-2xl border border-easy/20 p-5 glow-easy">
        <div className="flex items-start gap-3">
          <span className="w-8 h-8 rounded-lg bg-easy/10 flex items-center justify-center flex-shrink-0">
            <Zap size={16} className="text-easy" />
          </span>
          <div>
            <h2 className="font-display font-600 text-foreground text-lg">Prompt Engineering</h2>
            <p className="text-muted-foreground text-sm mt-1 leading-relaxed">
              A chatbot gives good answers but inconsistent ones — too long, unstructured, unfocused.
              Without changing the model, we fix this with a carefully designed system prompt.
            </p>
          </div>
        </div>
      </div>

      {/* Query input */}
      <div className="bg-card rounded-2xl border border-border p-5 space-y-4">
        <div className="flex flex-wrap gap-2">
          {EXAMPLES.map(ex => (
            <button key={ex} onClick={() => setQuery(ex)}
              className="text-xs px-3 py-1.5 rounded-full bg-card border border-border hover:border-accent/40 hover:text-accent transition-all text-muted-foreground">
              {ex}
            </button>
          ))}
        </div>
        <div className="flex gap-3">
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={e => e.key === "Enter" && run()}
            placeholder="Ask anything..."
            className="flex-1 bg-card border border-border rounded-xl px-4 py-3 text-foreground placeholder:text-muted-foreground text-sm focus:outline-none focus:border-easy/50 transition-colors"
          />
          <button onClick={run} disabled={loading || !query.trim()}
            className="px-5 py-3 bg-easy/10 hover:bg-easy/20 border border-easy/30 rounded-xl text-easy font-display font-600 text-sm transition-all disabled:opacity-40 flex items-center gap-2">
            {loading ? <span className="w-4 h-4 border-2 border-easy/40 border-t-easy rounded-full animate-spin" /> : <ChevronRight size={16} />}
            Run
          </button>
        </div>
      </div>

      {/* Side-by-side output */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Raw */}
        <div className="bg-card rounded-2xl border border-border p-5 space-y-3">
          <div className="flex items-center justify-between">
            <span className="font-display font-600 text-sm text-red-400">❌ Raw (No System Prompt)</span>
            <span className="text-xs text-muted-foreground font-mono">temp: 0.9</span>
          </div>
          <div className="min-h-[200px] text-sm text-muted-foreground leading-relaxed">
            {loading && !rawText ? (
              <div className="flex items-center justify-center h-[200px]">
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
              </div>
            ) : rawText ? (
              <div className={loading ? "streaming-cursor" : ""}>
                <Streamdown>{rawText}</Streamdown>
              </div>
            ) : (
              <p className="text-muted-foreground italic">Response will appear here...</p>
            )}
          </div>
          {rawText && (
            <div className="flex items-center gap-2 pt-2 border-t border-border">
              <span className="text-xs text-muted-foreground">{rawText.split(" ").length} words</span>
            </div>
          )}
        </div>

        {/* Engineered */}
        <div className="bg-card rounded-2xl border border-easy/20 p-5 space-y-3">
          <div className="flex items-center justify-between">
            <span className="font-display font-600 text-sm text-easy">✅ Engineered (System Prompt)</span>
            <span className="text-xs text-muted-foreground font-mono">temp: 0.3</span>
          </div>
          <div className="min-h-[200px] text-sm text-muted-foreground leading-relaxed">
            {loading && !engText ? (
              <div className="flex items-center justify-center h-[200px]">
                <Loader2 className="w-6 h-6 animate-spin text-easy" />
              </div>
            ) : engText ? (
              <div className={loading ? "streaming-cursor" : ""}>
                <Streamdown>{engText}</Streamdown>
              </div>
            ) : (
              <p className="text-muted-foreground italic">Structured response will appear here...</p>
            )}
          </div>
          {engText && (
            <div className="flex items-center gap-2 pt-2 border-t border-easy/10">
              <span className="text-xs text-muted-foreground">{engText.split(" ").length} words</span>
            </div>
          )}
        </div>
      </div>

      {/* System prompt viewer */}
      {systemPrompt && (
        <div className="bg-card rounded-2xl border border-border overflow-hidden">
          <button onClick={() => setShowPrompt(!showPrompt)}
            className="w-full flex items-center justify-between px-5 py-3 hover:bg-card transition-colors">
            <div className="flex items-center gap-2">
              <Code2 size={15} className="text-accent" />
              <span className="font-display font-600 text-sm text-muted-foreground">View Engineered System Prompt</span>
            </div>
            <ChevronRight size={15} className={`text-muted-foreground transition-transform ${showPrompt ? "rotate-90" : ""}`} />
          </button>
          {showPrompt && (
            <div className="px-5 pb-5">
              <pre className="code-block text-easy/80 text-xs">{systemPrompt}</pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
