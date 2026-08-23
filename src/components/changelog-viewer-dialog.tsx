import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Sparkles } from "lucide-react";
import ReactMarkdown from "react-markdown";
import rehypeRaw from "rehype-raw";
import rehypeSanitize from "rehype-sanitize";
import { HTML_SANITIZE_SCHEMA } from "@/lib/markdown-schema";

interface ChangelogViewerDialogProps {
  title: string;
  version: string;
  changelog: string;
  onClose: () => void;
}

/** Big, read-only view of one version's changelog (title + full body, images
 *  included) — opened from "Leer cambios" on the update announcement, and from
 *  clicking an entry in the history list. Purely informational, no confirm/cancel. */
export function ChangelogViewerDialog({ title, version, changelog, onClose }: ChangelogViewerDialogProps) {
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="bg-card border-white/10 text-foreground sm:max-w-2xl">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-accent shrink-0" />
            <DialogTitle className="text-white">{title || `Versión ${version}`}</DialogTitle>
          </div>
          <Badge variant="secondary" className="w-fit mt-1">
            v{version}
          </Badge>
        </DialogHeader>

        <div className="max-h-[65vh] overflow-y-auto rounded-md bg-background/50 border border-white/5 p-4 prose prose-invert prose-sm max-w-none prose-headings:text-white prose-strong:text-white prose-img:rounded-md">
          <ReactMarkdown rehypePlugins={[rehypeRaw, [rehypeSanitize, HTML_SANITIZE_SCHEMA]]}>{changelog}</ReactMarkdown>
        </div>

        <DialogFooter>
          <Button onClick={onClose} className="bg-accent hover:bg-accent/90 text-accent-foreground font-bold">
            Cerrar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
