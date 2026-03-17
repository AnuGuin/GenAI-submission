"use client";
import { useState, useRef } from "react";
import { Network, Upload, CheckCircle2, Loader2, ChevronRight } from "lucide-react";
import { Streamdown } from "streamdown";

const ROUTES = {
  DIRECT:     { label: "Direct LLM",   color: "#a78bfa", bg: "bg-violet-500/10",  border: "border-violet-500/30", icon: "🧠" },
  WEB_SEARCH: { label: "Web Search",   color: "#fb923c", bg: "bg-orange-500/10",  border: "border-orange-500/30", icon: "🌐" },
  WEATHER:    { label: "Weather API",  color: "#38bdf8", bg: "bg-sky-500/10",     border: "border-sky-500/30",    icon: "🌤️" },
  RAG:        { label: "RAG (Docs)",   color: "#4ade80", bg: "bg-green-500/10",   border: "border-green-500/30",  icon: "📄" },
};

const EXAMPLES = [
  { q: "What is the capital of France?" },
  { q: "What's the weather in Mumbai today?" },
  { q: "Latest news about AI today?" },
  { q: "Summarise the uploaded document" },
];

async function* streamSSE(url: string, body: object) {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
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

export default function MediumPanel() {
  const [query, setQuery] = useState("");
  const [intent, setIntent] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [answer, setAnswer] = useState("");
  const [loading, setLoading] = useState(false);
  const [classifying, setClassifying] = useState(false);
  const [uploadStatus, setUploadStatus] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const run = async () => {
    if (!query.trim()) return;
    setLoading(true); setClassifying(true); setIntent(null); setReason(""); setAnswer("");
    for await (const chunk of streamSSE("/api/medium/query", { query })) {
      if (chunk.type === "routing") { setIntent(chunk.intent); setReason(chunk.reason); setClassifying(false); }
      else if (chunk.type === "text") { setAnswer(prev => prev + chunk.text); }
    }
    setLoading(false); setClassifying(false);
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return;
    setUploadStatus("Uploading...");
    const form = new FormData(); form.append("file", file);
    const res = await fetch("/api/medium/upload-doc", { method: "POST", body: form });
    const data = await res.json();
    setUploadStatus(data.status === "ok" ? `✓ ${data.filename} — ${data.chunks} chunks indexed` : "Upload failed.");
  };

  const route = intent ? ROUTES[intent as keyof typeof ROUTES] : null;

  return (
    <div className="animate-slide-up space-y-6">
      <div className="bg-card rounded-2xl border border-medium/20 p-5 glow-medium">
        <div className="flex items-start gap-3">
          <span className="w-8 h-8 rounded-lg bg-medium/10 flex items-center justify-center flex-shrink-0"><Network size={16} className="text-medium" /></span>
          <div>
            <h2 className="font-display font-600 text-foreground text-lg">Agentic Query Router</h2>
            <p className="text-muted-foreground text-sm mt-1 leading-relaxed">Student assistant with 4 capabilities. Gemini classifies intent and routes to the best tool in real-time.</p>
          </div>
        </div>
      </div>

      {/* Live routing visualizer */}
      <div className="bg-card rounded-2xl border border-border p-5">
        <p className="text-xs font-display font-600 text-muted-foreground uppercase tracking-widest mb-4">Live Routing Decision</p>
        <div className="flex flex-col items-center gap-3">
          <div className="px-5 py-2 rounded-full bg-card border border-border text-sm text-muted-foreground font-mono">User Query</div>
          <div className="flex flex-col items-center gap-1">
            <div className="w-px h-3 bg-border" />
            <div className={`px-5 py-2 rounded-full text-sm font-display font-600 transition-all duration-300 ${classifying ? "bg-accent/20 border border-accent/60 text-accent animate-pulse2" : "bg-card border border-border text-muted-foreground"}`}>
              {classifying ? "🤔 Classifying..." : "Gemini Classifier"}
            </div>
            <div className="w-px h-3 bg-border" />
          </div>
          <div className="grid grid-cols-4 gap-2 w-full">
            {Object.entries(ROUTES).map(([key, r]) => (
              <div key={key} className={`flex flex-col items-center gap-1.5 p-3 rounded-xl border transition-all duration-500 ${intent === key ? `${r.bg} ${r.border} scale-105` : "bg-card border-border opacity-40"}`}>
                <span className="text-xl">{r.icon}</span>
                <span className="text-[11px] font-display font-600 text-muted-foreground text-center leading-tight">{r.label}</span>
                {intent === key && <span className="text-[9px] px-1.5 py-0.5 rounded-full font-mono font-600" style={{ color: r.color, background: `${r.color}22` }}>ACTIVE</span>}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Input */}
      <div className="bg-card rounded-2xl border border-border p-5 space-y-4">
        <div className="flex flex-wrap gap-2">
          {EXAMPLES.map(ex => (
            <button key={ex.q} onClick={() => setQuery(ex.q)} className="text-xs px-3 py-1.5 rounded-full bg-card border border-border hover:border-medium/40 hover:text-medium transition-all text-muted-foreground">{ex.q}</button>
          ))}
        </div>
        <div className="flex gap-3">
          <input value={query} onChange={e => setQuery(e.target.value)} onKeyDown={e => e.key === "Enter" && run()} placeholder="Ask anything — it will be routed automatically" className="flex-1 bg-card border border-border rounded-xl px-4 py-3 text-foreground placeholder:text-muted-foreground text-sm focus:outline-none focus:border-medium/50 transition-colors" />
          <button onClick={run} disabled={loading || !query.trim()} className="px-5 py-3 bg-medium/10 hover:bg-medium/20 border border-medium/30 rounded-xl text-medium font-display font-600 text-sm transition-all disabled:opacity-40 flex items-center gap-2">
            {loading ? <Loader2 size={15} className="animate-spin" /> : <ChevronRight size={16} />}
            Route
          </button>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={() => fileRef.current?.click()} className="flex items-center gap-2 text-xs px-3 py-2 rounded-lg bg-card border border-border hover:border-accent/40 text-muted-foreground hover:text-accent transition-all">
            <Upload size={13} /> Upload doc for RAG
          </button>
          {uploadStatus && <span className="text-xs text-easy flex items-center gap-1.5"><CheckCircle2 size={12} />{uploadStatus}</span>}
          <input ref={fileRef} type="file" accept=".pdf,.txt,.docx" className="hidden" onChange={handleUpload} />
        </div>
      </div>

      {/* Result */}
      {(intent || answer) && (
        <div className="space-y-3 animate-fade-in">
          {intent && route && (
            <div className={`flex items-start gap-3 p-4 rounded-xl ${route.bg} border ${route.border}`}>
              <span className="text-2xl">{route.icon}</span>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-display font-600 text-sm text-foreground">Routed → {route.label}</span>
                  <span className="route-badge" style={{ color: route.color, background: `${route.color}18` }}>{intent}</span>
                </div>
                {reason && <p className="text-xs text-muted-foreground mt-1">{reason}</p>}
              </div>
            </div>
          )}
          {answer && (
            <div className="bg-card rounded-2xl border border-border p-5">
              <p className="text-xs font-display font-600 text-muted-foreground uppercase tracking-widest mb-3">Answer</p>
              <div className="text-sm text-muted-foreground leading-relaxed overflow-hidden">
                <Streamdown>{answer}</Streamdown>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
