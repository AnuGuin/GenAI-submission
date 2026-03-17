"use client";
import { useState, useRef } from "react";
import { Database, Upload, Loader2, ChevronRight, Table } from "lucide-react";

const SAMPLE_QUESTIONS = [
  "Show me the top 5 rows",
  "What is the average value of each numeric column?",
  "How many rows are there?",
  "Find rows where any column contains a specific value",
];

async function* streamSSE(url: string, body: object) {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (!res.body) return;
  const reader = res.body.getReader();
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

export default function ComplexPanel() {
  const [schema, setSchema] = useState<any>(null);
  const [sample, setSample] = useState<any[]>([]);
  const [columns, setColumns] = useState<string[]>([]);
  const [question, setQuestion] = useState("");
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [uploadLoading, setUploadLoading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return;
    setUploadLoading(true);
    try {
      const form = new FormData(); form.append("file", file);
      const res = await fetch("/api/complex/upload", { method: "POST", body: form });
      const data = await res.json();
      if (!data.error) { 
        setSchema(data.schema || data); 
        setSample(data.sample || []); 
        setColumns(data.columns || []); 
      } else {
        console.error("Backend returned error:", data.error);
        alert(data.error);
      }
    } catch (err) {
      console.error("Upload failed", err);
    } finally {
      setUploadLoading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const run = async () => {
    if (!question.trim() || !schema) return;
    setLoading(true); 
    setResult({ sql: "", results: null, nl_answer: "", rag_comparison: "" });
    
    try {
      for await (const chunk of streamSSE("/api/complex/query", { question })) {
        if (chunk.type === "sql") {
          setResult((prev: any) => ({ ...prev, sql: chunk.sql }));
        } else if (chunk.type === "results") {
          setResult((prev: any) => ({ ...prev, results: chunk.results }));
        } else if (chunk.type === "nl_chunk") {
          setResult((prev: any) => ({ ...prev, nl_answer: (prev.nl_answer || "") + chunk.text }));
        } else if (chunk.type === "rag_chunk") {
          setResult((prev: any) => ({ ...prev, rag_comparison: (prev.rag_comparison || "") + chunk.text }));
        }
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="animate-slide-up space-y-6">
      <div className="bg-card rounded-2xl border border-complex/20 p-5 glow-complex">
        <div className="flex items-start gap-3">
          <span className="w-8 h-8 rounded-lg bg-complex/10 flex items-center justify-center flex-shrink-0"><Database size={16} className="text-complex" /></span>
          <div>
            <h2 className="font-display font-600 text-foreground text-lg">Structured Data vs RAG</h2>
            <p className="text-muted-foreground text-sm mt-1 leading-relaxed">
              RAG fails on tabular data because it retrieves text chunks — not relationships between rows and columns.
              This demo uses Text-to-SQL instead, showing why it's the right approach.
            </p>
          </div>
        </div>
      </div>

      <div className="bg-card rounded-2xl border border-border p-5 space-y-4">
        <p className="text-xs font-display font-600 text-muted-foreground uppercase tracking-widest">Step 1 — Upload Structured Data</p>
        <div className="flex items-center gap-4">
          <button onClick={() => fileRef.current?.click()}
            className="flex items-center gap-2 px-4 py-3 rounded-xl bg-complex/10 hover:bg-complex/20 border border-complex/30 text-complex font-display font-600 text-sm transition-all">
            {uploadLoading ? <Loader2 size={15} className="animate-spin" /> : <Upload size={15} />}
            {uploadLoading ? "Processing..." : "Upload CSV / Excel / JSON"}
          </button>
          <span className="text-xs text-muted-foreground">Supports .csv, .xlsx, .json</span>
          <input ref={fileRef} type="file" accept=".csv,.xlsx,.xls,.json" className="hidden" onChange={handleUpload} />
        </div>

        {schema && (
          <div className="space-y-3 animate-fade-in">
            <div className="flex items-center gap-2">
              <span className="text-xs text-easy flex items-center gap-1.5 font-mono">✓ Dataset loaded</span>
            </div>
            <pre className="code-block text-complex/80 text-xs">{typeof schema === 'object' ? JSON.stringify(schema, null, 2) : schema}</pre>
          </div>
        )}

        {sample.length > 0 && columns.length > 0 && (
          <div className="overflow-x-auto rounded-xl border border-border">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-card border-b border-border">
                  {columns.map(col => <th key={col} className="text-left px-3 py-2 text-muted-foreground font-display font-600">{col}</th>)}
                </tr>
              </thead>
              <tbody>
                {sample.map((row, i) => (
                  <tr key={i} className="border-b border-border/50 hover:bg-card transition-colors">
                    {columns.map(col => <td key={col} className="px-3 py-2 text-muted-foreground font-mono truncate max-w-[120px]">{String(row[col] ?? "")}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="bg-card rounded-2xl border border-border p-5 space-y-4">
        <p className="text-xs font-display font-600 text-muted-foreground uppercase tracking-widest">Step 2 — Ask in Natural Language</p>
        {!schema && <p className="text-sm text-muted-foreground italic">Upload a dataset first to enable querying.</p>}
        <div className="flex flex-wrap gap-2">
          {SAMPLE_QUESTIONS.map(q => (
            <button key={q} onClick={() => setQuestion(q)} disabled={!schema}
              className="text-xs px-3 py-1.5 rounded-full bg-card border border-border hover:border-complex/40 hover:text-complex transition-all text-muted-foreground disabled:opacity-30">
              {q}
            </button>
          ))}
        </div>
        <div className="flex gap-3">
          <input value={question} onChange={e => setQuestion(e.target.value)} onKeyDown={e => e.key === "Enter" && run()}
            disabled={!schema} placeholder={schema ? "Ask anything about the data..." : "Upload data first..."}
            className="flex-1 bg-card border border-border rounded-xl px-4 py-3 text-foreground placeholder:text-muted-foreground text-sm focus:outline-none focus:border-complex/50 transition-colors disabled:opacity-40" />
          <button onClick={run} disabled={loading || !question.trim() || !schema}
            className="px-5 py-3 bg-complex/10 hover:bg-complex/20 border border-complex/30 rounded-xl text-complex font-display font-600 text-sm transition-all disabled:opacity-40 flex items-center gap-2">
            {loading ? <Loader2 size={15} className="animate-spin" /> : <ChevronRight size={16} />}
            Query
          </button>
        </div>
      </div>

      {result && (
        <div className="space-y-4 animate-fade-in">
          
          {result.sql && (
            <div className="bg-card rounded-2xl border border-complex/20 p-5">
              <p className="text-xs font-display font-600 text-complex/60 uppercase tracking-widest mb-3">Generated SQL</p>
              <pre className="code-block text-complex text-sm">{result.sql}</pre>
            </div>
          )}

          {result.nl_answer && (
            <div className="bg-card rounded-2xl border border-border p-5">
              <p className="text-xs font-display font-600 text-muted-foreground uppercase tracking-widest mb-3">Natural Language Answer</p>
              <p className="text-sm text-muted-foreground leading-relaxed">{result.nl_answer}</p>
            </div>
          )}

          {result.results?.length > 0 && (
            <div className="bg-card rounded-2xl border border-border p-5 space-y-3">
              <div className="flex items-center gap-2">
                <Table size={14} className="text-muted-foreground" />
                <p className="text-xs font-display font-600 text-muted-foreground uppercase tracking-widest">Query Results ({result.results.length} rows)</p>
              </div>
              <div className="overflow-x-auto rounded-xl border border-border">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-card border-b border-border">
                      {Object.keys(result.results[0]).map(col => <th key={col} className="text-left px-3 py-2 text-muted-foreground font-display font-600">{col}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {result.results.map((row: any, i: number) => (
                      <tr key={i} className="border-b border-border/50 hover:bg-card transition-colors">
                        {Object.values(row).map((val: any, j: number) => <td key={j} className="px-3 py-2 text-muted-foreground font-mono">{String(val ?? "")}</td>)}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {result.rag_comparison && (
            <div className="bg-card rounded-2xl border border-red-500/20 p-5">
              <p className="text-xs font-display font-600 text-red-400/70 uppercase tracking-widest mb-3">Why RAG Fails Here</p>
              <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-line">{result.rag_comparison}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
