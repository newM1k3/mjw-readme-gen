import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeRaw from "rehype-raw";
import { toast } from "sonner";
import { Copy, Download, Eye, Code2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Props {
  content: string;
  filename?: string;
  /** When true, shows a blinking cursor and disables copy/download */
  isStreaming?: boolean;
}

export function MarkdownPreview({
  content,
  filename = "README.md",
  isStreaming = false,
}: Props) {
  const [tab, setTab] = useState<"preview" | "raw">("preview");
  const bottomRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const userScrolledRef = useRef(false);

  // Auto-scroll to bottom while streaming unless user has scrolled up
  useEffect(() => {
    if (!isStreaming) return;
    if (userScrolledRef.current) return;
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [content, isStreaming]);

  // Detect manual scroll during streaming
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onScroll = () => {
      if (!isStreaming) return;
      const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
      userScrolledRef.current = !atBottom;
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, [isStreaming]);

  // Reset scroll lock when a new stream starts
  useEffect(() => {
    if (isStreaming) userScrolledRef.current = false;
  }, [isStreaming]);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(content);
    toast.success("Copied to clipboard");
  };

  const handleDownload = () => {
    const blob = new Blob([content], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`Downloaded ${filename}`);
  };

  // Append a blinking cursor to the raw text during streaming
  const displayContent = isStreaming ? content + "▋" : content;

  return (
    <div className="flex flex-col h-full border border-border">
      {/* Toolbar */}
      <div className="flex items-center justify-between border-b border-border bg-card px-3 py-2 shrink-0">
        <div className="flex items-center gap-3">
          <div className="flex gap-0">
            <button
              onClick={() => setTab("preview")}
              className={`flex items-center gap-1.5 px-3 py-1 text-xs font-mono border transition-colors ${
                tab === "preview"
                  ? "bg-primary text-primary-foreground border-primary"
                  : "border-border text-muted-foreground hover:text-foreground"
              }`}
            >
              <Eye className="w-3 h-3" />
              Preview
            </button>
            <button
              onClick={() => setTab("raw")}
              className={`flex items-center gap-1.5 px-3 py-1 text-xs font-mono border border-l-0 transition-colors ${
                tab === "raw"
                  ? "bg-primary text-primary-foreground border-primary"
                  : "border-border text-muted-foreground hover:text-foreground"
              }`}
            >
              <Code2 className="w-3 h-3" />
              Raw
            </button>
          </div>

          {/* Streaming indicator */}
          {isStreaming && (
            <div className="flex items-center gap-1.5 text-[11px] font-mono text-primary animate-pulse">
              <Loader2 className="w-3 h-3 animate-spin" />
              Writing…
            </div>
          )}
        </div>

        <div className="flex gap-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleCopy}
            disabled={isStreaming}
            className="h-7 px-2 text-xs font-mono"
          >
            <Copy className="w-3 h-3 mr-1" />
            Copy
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleDownload}
            disabled={isStreaming}
            className="h-7 px-2 text-xs font-mono"
          >
            <Download className="w-3 h-3 mr-1" />
            .md
          </Button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto" ref={containerRef}>
        {tab === "preview" ? (
          <div className="markdown-body p-6">
            <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw]}>
              {displayContent}
            </ReactMarkdown>
            <div ref={bottomRef} />
          </div>
        ) : (
          <pre className="p-4 text-xs font-mono text-foreground/80 whitespace-pre-wrap break-words leading-relaxed">
            {displayContent}
            <div ref={bottomRef} />
          </pre>
        )}
      </div>
    </div>
  );
}
