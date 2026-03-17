"use client";
import { useState } from "react";
import { Brain, Loader2, Layers } from "lucide-react";
import { Streamdown } from "streamdown";

const STRATEGIES = [
  { id: "sliding_window",      label: "Sliding Window",      icon: "⬅️", color: "#f472b6", desc: "Keep last N tokens. Fast but lossy." },
  { id: "summarization_chain", label: "Summarization Chain", icon: "🔗", color: "#fb923c", desc: "Compress older turns periodically." },
  { id: "hierarchical_memory", label: "Hierarchical Memory", icon: "🧱", color: "#a78bfa", desc: "Episodic → Semantic → Archival layers." },
];

const SAMPLE = `Alice: Hey, I wanted to discuss the Q3 roadmap. We're behind on the new LLM integration feature.
Bob: Yeah, I know. The Gemini API docs were updated recently and our previous implementation broke. We spent 3 days debugging rate limits.
Alice: Did you escalate to the AI platform team?
Bob: Yes, filed a ticket last Thursday. Ticket #45821. They said 5-7 business days to adjust our quotas.
Alice: Okay. Meanwhile, can we unblock the RAG pipeline? That's blocking the data science team.
Bob: The data science team needs hybrid search (keyword + semantic). Our current vector database doesn't support BM25 natively.
Alice: Can we swap the vector DB?
Bob: We'd need to migrate 14 million embeddings and update the query logic. Risky before the launch.
Alice: What about a thin orchestrator layer that merges results from ElasticSearch and our current Vector DB?
Bob: That could work. I can build a quick LangChain/LlamaIndex spike today — maybe 4 hours.
Alice: Perfect. Also — the prompt engineering review for the customer support bot is tomorrow at 2pm.
Bob: I'll be there. Should I bring the evaluation matrix and test cases?
Alice: Please do. And loop in Sarah from product to review tone and safety rails.
Bob: Done. One more thing — the infra team is asking about the cache config for LLM responses. They want TTL values.
Alice: Tell them 1 hour for standard Q&A, 24 hours for summarization tasks, 7 days for static document embeddings.
Bob: Got it. I'll ping them now.`;

export default function HardPanel() {
  const [text, setText] = useState(SAMPLE);
  const [strategy, setStrategy] = useState("sliding_window");
  const [windowSize, setWindowSize] = useState(100);
  const [query, setQuery] = useState("");
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const run = async () => {
    setLoading(true); setResult(null);
    const res = await fetch("/api/hard/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, strategy, window_size: windowSize, query }),
    });
    setResult(await res.json());
    setLoading(false);
  };

  const meta = result?.meta;
  const layers = meta?.layers;

  return (
    <div className="animate-slide-up space-y-6">
      <div className="bg-card rounded-2xl border border-hard/20 p-5 glow-hard">
        <div className="flex items-start gap-3">
          <span className="w-8 h-8 rounded-lg bg-hard/10 flex items-center justify-center flex-shrink-0"><Brain size={16} className="text-hard" /></span>
          <div>
            <h2 className="font-display font-600 text-foreground text-lg">Context Rot Solutions</h2>
            <p className="text-muted-foreground text-sm mt-1 leading-relaxed">Compare 3 strategies that prevent long-context degradation without ballooning token usage.</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        {STRATEGIES.map(s => (
          <button key={s.id} onClick={() => setStrategy(s.id)}
            className={`p-4 rounded-xl border text-left transition-all duration-200 ${strategy === s.id ? "border-hard/40 bg-hard/5" : "border-border bg-card hover:bg-card"}`}>
            <div className="text-xl mb-2">{s.icon}</div>
            <div className="font-display font-600 text-sm text-foreground">{s.label}</div>
            <div className="text-xs text-muted-foreground mt-1">{s.desc}</div>
            {strategy === s.id && <div className="mt-2 w-full h-0.5 rounded-full" style={{ background: s.color }} />}
          </button>
        ))}
      </div>

      {strategy === "sliding_window" && (
        <div className="bg-card rounded-xl border border-border p-4 flex items-center gap-4">
          <span className="text-sm text-muted-foreground whitespace-nowrap">Window size:</span>
          <input type="range" min={50} max={300} step={10} value={windowSize} onChange={e => setWindowSize(+e.target.value)} className="flex-1 accent-hard" />
          <span className="font-mono text-sm text-hard min-w-[60px] text-right">{windowSize} words</span>
        </div>
      )}

      <div className="bg-card rounded-2xl border border-border p-5 space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-xs font-display font-600 text-muted-foreground uppercase tracking-widest">Conversation / Document</span>
          <span className="text-xs text-muted-foreground font-mono">{text.split(" ").length} words</span>
        </div>
        <textarea value={text} onChange={e => setText(e.target.value)} rows={7}
          className="w-full bg-card border border-border rounded-xl px-4 py-3 text-sm text-muted-foreground focus:outline-none focus:border-hard/40 transition-colors resize-none font-mono" />
        <input value={query} onChange={e => setQuery(e.target.value)}
          placeholder="Optional: ask a follow-up question answered using compressed context..."
          className="w-full bg-card border border-border rounded-xl px-4 py-3 text-foreground placeholder:text-muted-foreground text-sm focus:outline-none focus:border-hard/50 transition-colors" />
        <button onClick={run} disabled={loading || !text.trim()}
          className="w-full py-3 bg-hard/10 hover:bg-hard/20 border border-hard/30 rounded-xl text-hard font-display font-600 text-sm transition-all disabled:opacity-40 flex items-center justify-center gap-2">
          {loading ? <Loader2 size={15} className="animate-spin" /> : <Layers size={15} />}
          Apply Strategy
        </button>
      </div>

      {result && (
        <div className="space-y-4 animate-fade-in">
          {/* Stats row */}
          {meta && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { label: "Original", value: meta.original_words, color: "text-foreground" },
                { label: "Kept / Summary", value: meta.kept_words ?? meta.summary_words ?? "—", color: "text-hard" },
                { label: "Compression", value: meta.compression_ratio ? `${Math.round(meta.compression_ratio*100)}%` : "—", color: "text-easy" },
                { label: "Chunks", value: meta.chunks_processed ?? "—", color: "text-accent" },
              ].map(stat => (
                <div key={stat.label} className="bg-card rounded-xl border border-border p-4 text-center">
                  <div className={`font-display font-700 text-2xl ${stat.color}`}>{stat.value}</div>
                  <div className="text-xs text-muted-foreground mt-1">{stat.label}</div>
                </div>
              ))}
            </div>
          )}

          {layers && (
            <div className="bg-card rounded-2xl border border-border p-5 space-y-3">
              <p className="text-xs font-display font-600 text-muted-foreground uppercase tracking-widest">Memory Layers</p>
              {[
                { key: "episodic", label: "🧠 Episodic (Recent)", color: "text-violet-400", border: "border-violet-500/20" },
                { key: "semantic", label: "📚 Semantic (Facts)", color: "text-amber-400", border: "border-amber-500/20" },
              ].map(tier => (
                <div key={tier.key} className={`p-3 rounded-xl bg-card border ${tier.border}`}>
                  <p className={`text-xs font-display font-600 ${tier.color} mb-2`}>{tier.label}</p>
                  <ul className="space-y-1">{(layers[tier.key] || []).map((e: string, i: number) => <li key={i} className="text-xs text-muted-foreground">• {e}</li>)}</ul>
                </div>
              ))}
              <div className="p-3 rounded-xl bg-card border border-teal-500/20">
                <p className="text-xs font-display font-600 text-teal-400 mb-2">🗄️ Archival (Background)</p>
                <p className="text-xs text-muted-foreground">{layers.archival}</p>
              </div>
            </div>
          )}

          {result.context_preview && (
            <div className="bg-card rounded-2xl border border-border p-5">
              <p className="text-xs font-display font-600 text-muted-foreground uppercase tracking-widest mb-3">Compressed Context Preview</p>
              <pre className="code-block text-muted-foreground text-xs whitespace-pre-wrap break-words">{result.context_preview}</pre>
            </div>
          )}

          {result.answer && (
            <div className="bg-card rounded-2xl border border-hard/20 p-5">
              <p className="text-xs font-display font-600 text-hard/60 uppercase tracking-widest mb-3">Answer (from compressed context)</p>
              <div className="text-sm text-muted-foreground leading-relaxed overflow-hidden">
                <Streamdown>{result.answer}</Streamdown>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
