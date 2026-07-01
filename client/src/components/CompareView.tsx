import { useState, useMemo } from "react";
import { diffLines } from "diff";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeRaw from "rehype-raw";
import { toast } from "sonner";
import { Copy, Download, X, GitCompare } from "lucide-react";
import { Button } from "@/components/ui/button";

interface HistoryItem {
  id: number;
  projectName: string;
  model: string;
  modelLabel?: string;
  createdAt: string | Date;
  readme: string;
}

type Mode = "preview" | "raw" | "diff" | "merge";

function PaneHeader({ item, side, onCopy, onDownload }: {
  item: HistoryItem;
  side: "A" | "B";
  onCopy: () => void;
  onDownload: () => void;
}) {
  return (
    <div className="flex items-center justify-between border-b border-border bg-card px-3 py-2 shrink-0">
      <div className="flex items-center gap-2">
        <span className={`text-xs font-bold px-2 py-0.5 ${side === "A" ? "bg-blue-500/20 text-blue-300" : "bg-purple-500/20 text-purple-300"}`}>
          {side}
        </span>
        <span className="text-xs font-mono text-foreground truncate max-w-[140px]">{item.projectName}</span>
        <span className="text-[10px] text-muted-foreground">{item.modelLabel || item.model}</span>
      </div>
      <div className="flex gap-1">
        <button onClick={onCopy} className="p-1 text-muted-foreground hover:text-foreground transition-colors">
          <Copy className="w-3 h-3" />
        </button>
        <button onClick={onDownload} className="p-1 text-muted-foreground hover:text-foreground transition-colors">
          <Download className="w-3 h-3" />
        </button>
      </div>
    </div>
  );
}

function DiffPane({ a, b }: { a: string; b: string }) {
  const changes = useMemo(() => diffLines(a, b), [a, b]);
  const added = changes.filter((c) => c.added).reduce((s, c) => s + (c.count || 0), 0);
  const removed = changes.filter((c) => c.removed).reduce((s, c) => s + (c.count || 0), 0);

  return (
    <div className="flex flex-col h-full">
      <div className="border-b border-border bg-card px-3 py-2 text-xs font-mono shrink-0 flex gap-4">
        <span className="text-green-400">+{added} added</span>
        <span className="text-red-400">-{removed} removed</span>
      </div>
      <div className="flex-1 overflow-auto">
        <pre className="text-xs font-mono leading-relaxed">
          {changes.map((change, i) => {
            const cls = change.added ? "diff-add" : change.removed ? "diff-remove" : "diff-context";
            const prefix = change.added ? "+" : change.removed ? "-" : " ";
            const lines = (change.value || "").split("\n").filter((_, li, arr) => li < arr.length - 1 || change.value.endsWith("\n") || li < arr.length - 1);
            return lines.map((line, j) => (
              <div key={`${i}-${j}`} className={`px-3 py-0 ${cls}`}>
                <span className="select-none mr-2 opacity-50">{prefix}</span>
                {line}
              </div>
            ));
          })}
        </pre>
      </div>
    </div>
  );
}

function MergePane({ a, b, aItem, bItem }: { a: string; b: string; aItem: HistoryItem; bItem: HistoryItem }) {
  const changes = useMemo(() => diffLines(a, b), [a, b]);
  const [picks, setPicks] = useState<Record<number, "a" | "b">>({});
  const [assembled, setAssembled] = useState(false);

  const conflictGroups: { idx: number; aLines: string; bLines: string }[] = [];
  let ci = 0;
  for (const c of changes) {
    if (c.added || c.removed) {
      const existing = conflictGroups[conflictGroups.length - 1];
      if (existing && !existing.aLines && c.removed) {
        existing.aLines = c.value;
      } else if (existing && !existing.bLines && c.added) {
        existing.bLines = c.value;
      } else {
        conflictGroups.push({
          idx: ci++,
          aLines: c.removed ? c.value : "",
          bLines: c.added ? c.value : "",
        });
      }
    }
  }

  const merged = useMemo(() => {
    const parts: string[] = [];
    let conflictIdx = 0;
    for (const c of changes) {
      if (!c.added && !c.removed) {
        parts.push(c.value);
      } else if (c.removed) {
        const g = conflictGroups[conflictIdx];
        if (g) {
          const pick = picks[g.idx] ?? "a";
          if (pick === "a") parts.push(c.value);
        }
      } else if (c.added) {
        const g = conflictGroups[conflictIdx];
        if (g) {
          const pick = picks[g.idx] ?? "a";
          if (pick === "b") parts.push(c.value);
          conflictIdx++;
        }
      }
    }
    return parts.join("");
  }, [changes, picks, conflictGroups]);

  const handleDownload = () => {
    const blob = new Blob([merged], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "README-merged.md";
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Downloaded merged README");
  };

  if (assembled) {
    return (
      <div className="flex flex-col h-full">
        <div className="border-b border-border bg-card px-3 py-2 flex items-center justify-between shrink-0">
          <span className="text-xs font-mono text-foreground">Merged Result</span>
          <div className="flex gap-1">
            <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => { navigator.clipboard.writeText(merged); toast.success("Copied"); }}>
              <Copy className="w-3 h-3 mr-1" />Copy
            </Button>
            <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={handleDownload}>
              <Download className="w-3 h-3 mr-1" />.md
            </Button>
            <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => setAssembled(false)}>
              Back
            </Button>
          </div>
        </div>
        <div className="flex-1 overflow-auto markdown-body p-6">
          <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw]}>{merged}</ReactMarkdown>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="border-b border-border bg-card px-3 py-2 flex items-center justify-between shrink-0">
        <span className="text-xs font-mono text-muted-foreground">
          {conflictGroups.length} conflict{conflictGroups.length !== 1 ? "s" : ""} — pick best sections
        </span>
        <Button size="sm" className="h-7 px-3 text-xs" onClick={() => setAssembled(true)}>
          Assemble →
        </Button>
      </div>
      <div className="flex-1 overflow-auto p-4 space-y-3">
        {conflictGroups.length === 0 && (
          <div className="text-xs text-muted-foreground text-center py-8">No conflicts — files are identical.</div>
        )}
        {conflictGroups.map((g) => (
          <div key={g.idx} className="border border-border">
            <div className="text-[10px] font-mono text-muted-foreground px-3 py-1 border-b border-border bg-card">
              Conflict #{g.idx + 1}
            </div>
            <div className="grid grid-cols-2 divide-x divide-border">
              <button
                onClick={() => setPicks((p) => ({ ...p, [g.idx]: "a" }))}
                className={`p-3 text-left text-xs font-mono transition-colors ${
                  (picks[g.idx] ?? "a") === "a" ? "bg-blue-500/10 border-l-2 border-l-blue-400" : "hover:bg-card"
                }`}
              >
                <div className="text-[10px] font-bold text-blue-400 mb-1">{aItem.projectName} (A)</div>
                <pre className="whitespace-pre-wrap text-[11px] text-foreground/70">{g.aLines || "(empty)"}</pre>
              </button>
              <button
                onClick={() => setPicks((p) => ({ ...p, [g.idx]: "b" }))}
                className={`p-3 text-left text-xs font-mono transition-colors ${
                  picks[g.idx] === "b" ? "bg-purple-500/10 border-l-2 border-l-purple-400" : "hover:bg-card"
                }`}
              >
                <div className="text-[10px] font-bold text-purple-400 mb-1">{bItem.projectName} (B)</div>
                <pre className="whitespace-pre-wrap text-[11px] text-foreground/70">{g.bLines || "(empty)"}</pre>
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

interface Props {
  itemA: HistoryItem;
  itemB: HistoryItem;
  onClose: () => void;
}

export function CompareView({ itemA, itemB, onClose }: Props) {
  const [mode, setMode] = useState<Mode>("preview");

  const copyA = async () => { await navigator.clipboard.writeText(itemA.readme); toast.success("Copied A"); };
  const copyB = async () => { await navigator.clipboard.writeText(itemB.readme); toast.success("Copied B"); };

  const downloadA = () => {
    const blob = new Blob([itemA.readme], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `${itemA.projectName}-A.md`; a.click();
    URL.revokeObjectURL(url);
  };
  const downloadB = () => {
    const blob = new Blob([itemB.readme], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `${itemB.projectName}-B.md`; a.click();
    URL.revokeObjectURL(url);
  };

  const MODES: { key: Mode; label: string }[] = [
    { key: "preview", label: "Preview" },
    { key: "raw", label: "Raw" },
    { key: "diff", label: "Diff" },
    { key: "merge", label: "Merge" },
  ];

  return (
    <div className="flex flex-col h-full">
      {/* Compare toolbar */}
      <div className="flex items-center justify-between border-b border-border bg-card px-4 py-2 shrink-0">
        <div className="flex items-center gap-3">
          <GitCompare className="w-4 h-4 text-primary" />
          <span className="text-xs font-mono font-bold">COMPARE</span>
          <div className="flex gap-0 ml-2">
            {MODES.map((m) => (
              <button
                key={m.key}
                onClick={() => setMode(m.key)}
                className={`px-3 py-1 text-xs font-mono border transition-colors ${
                  mode === m.key
                    ? "bg-primary text-primary-foreground border-primary"
                    : "border-border text-muted-foreground hover:text-foreground"
                } border-r-0 last:border-r`}
              >
                {m.label}
              </button>
            ))}
          </div>
        </div>
        <button onClick={onClose} className="p-1 text-muted-foreground hover:text-foreground transition-colors">
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Panes */}
      {mode === "diff" ? (
        <div className="flex-1 overflow-hidden">
          <DiffPane a={itemA.readme} b={itemB.readme} />
        </div>
      ) : mode === "merge" ? (
        <div className="flex-1 overflow-hidden">
          <MergePane a={itemA.readme} b={itemB.readme} aItem={itemA} bItem={itemB} />
        </div>
      ) : (
        <div className="flex-1 grid grid-cols-2 divide-x divide-border overflow-hidden">
          {/* Pane A */}
          <div className="flex flex-col overflow-hidden">
            <PaneHeader item={itemA} side="A" onCopy={copyA} onDownload={downloadA} />
            <div className="flex-1 overflow-auto">
              {mode === "preview" ? (
                <div className="markdown-body p-4">
                  <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw]}>{itemA.readme}</ReactMarkdown>
                </div>
              ) : (
                <pre className="p-4 text-xs font-mono whitespace-pre-wrap text-foreground/80">{itemA.readme}</pre>
              )}
            </div>
          </div>
          {/* Pane B */}
          <div className="flex flex-col overflow-hidden">
            <PaneHeader item={itemB} side="B" onCopy={copyB} onDownload={downloadB} />
            <div className="flex-1 overflow-auto">
              {mode === "preview" ? (
                <div className="markdown-body p-4">
                  <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw]}>{itemB.readme}</ReactMarkdown>
                </div>
              ) : (
                <pre className="p-4 text-xs font-mono whitespace-pre-wrap text-foreground/80">{itemB.readme}</pre>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
