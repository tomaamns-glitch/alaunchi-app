import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeRaw from "rehype-raw";
import rehypeSanitize from "rehype-sanitize";
import { FileQuestion, Languages, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { HTML_SANITIZE_SCHEMA } from "@/lib/markdown-schema";
import { getProjectDetail, type ModrinthProjectDetail } from "@/services/modrinth";
import { translateHtmlAwareToSpanish } from "@/services/translate";

/**
 * The "Resumen" of an instance installed from Modrinth: the text and images of
 * the modpack's page. Translated to Spanish like a mod's description, falling
 * back to the original if the translation fails.
 */
export function ModrinthSummary({
  projectId,
  onOpenImage,
  actionsEl,
  showGallery = true,
}: {
  projectId: string;
  /** `gallery`: every image of the project, for the viewer's prev/next. */
  onOpenImage: (image: { src: string; title?: string }, gallery: { src: string; title?: string }[]) => void;
  /** Where the translation toggle goes: the page's section buttons row. */
  actionsEl: HTMLElement | null;
  /** False when the images have a section of their own (Explorar). */
  showGallery?: boolean;
}) {
  // undefined = still loading; null = couldn't be fetched.
  const [detail, setDetail] = useState<ModrinthProjectDetail | null | undefined>(undefined);
  const [translated, setTranslated] = useState<string | null>(null);
  const [showOriginal, setShowOriginal] = useState(false);

  const text = detail ? [detail.description, detail.body].filter((part) => part?.trim()).join("\n\n") : "";

  useEffect(() => {
    let cancelled = false;
    setDetail(undefined);
    getProjectDetail(projectId).then((result) => {
      if (!cancelled) setDetail(result);
    });
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  useEffect(() => {
    setTranslated(null);
    setShowOriginal(false);
    if (!text) return;
    let cancelled = false;
    translateHtmlAwareToSpanish(text).then((result) => {
      if (!cancelled) setTranslated(result);
    });
    return () => {
      cancelled = true;
    };
  }, [text]);

  if (detail === undefined) {
    return (
      <div className="flex items-center justify-center py-16 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin mr-2" /> Cargando...
      </div>
    );
  }

  if (!detail || (!text && (!showGallery || detail.gallery.length === 0))) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-2">
        <FileQuestion className="h-6 w-6" />
        <p className="text-sm">{detail ? "Este modpack no tiene resumen en Modrinth." : "No se ha podido cargar el resumen de Modrinth."}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 pt-4">
      {!!text && (
        <div>
          {translated &&
            actionsEl &&
            createPortal(
              <Button
                size="sm"
                variant="outline"
                onClick={() => setShowOriginal((v) => !v)}
                className="gap-1.5 font-semibold"
              >
                <Languages className="h-3.5 w-3.5" />
                {showOriginal ? "Ver traducción" : "Ver original"}
              </Button>,
              actionsEl
            )}
          <div className="prose prose-sm prose-invert max-w-none prose-img:rounded-md prose-a:text-accent select-text">
            <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw, [rehypeSanitize, HTML_SANITIZE_SCHEMA]]}>
              {showOriginal ? text : translated ?? text}
            </ReactMarkdown>
          </div>
        </div>
      )}
      {showGallery && detail.gallery.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-white">Galería</h3>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {detail.gallery.map((image) => (
              <button
                type="button"
                key={image.url}
                onClick={() =>
                  onOpenImage(
                    { src: image.rawUrl || image.url, title: image.title },
                    detail.gallery.map((g) => ({ src: g.rawUrl || g.url, title: g.title }))
                  )
                }
                className="block"
              >
                <img
                  src={image.url}
                  alt={image.title || ""}
                  className="w-full aspect-video object-cover rounded-md border border-white/10 hover:border-white/30 transition-colors"
                />
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
