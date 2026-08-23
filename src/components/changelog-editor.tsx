import { useEffect, type ReactNode } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import Image from "@tiptap/extension-image";
import { Bold, Italic, Underline as UnderlineIcon, Heading2, List, ListOrdered, ImagePlus } from "lucide-react";
import { cn } from "@/lib/utils";

interface ChangelogEditorProps {
  value: string;
  onChange: (html: string) => void;
  disabled?: boolean;
}

/** Blog-post-style rich text editor for the changelog — bold/italic/underline,
 *  a heading level, and lists. Stores/publishes as HTML (see markdown-schema.ts
 *  for how it's rendered back safely elsewhere in the app). */
export function ChangelogEditor({ value, onChange, disabled }: ChangelogEditorProps) {
  const editor = useEditor({
    extensions: [StarterKit, Underline, Image],
    content: value,
    editable: !disabled,
    onUpdate: ({ editor }) => onChange(editor.getHTML()),
    editorProps: {
      attributes: {
        class:
          "prose prose-invert prose-sm max-w-none min-h-24 px-3 py-2 focus:outline-none prose-headings:text-white prose-strong:text-white",
      },
    },
  });

  // Value can change from outside (e.g. the reset effect when switching modpack
  // in the admin page) — Tiptap owns its own internal doc after creation, so
  // external resets have to be pushed in explicitly.
  useEffect(() => {
    if (!editor) return;
    if (editor.getHTML() !== value) editor.commands.setContent(value || "", { emitUpdate: false });
  }, [value, editor]);

  useEffect(() => {
    editor?.setEditable(!disabled);
  }, [disabled, editor]);

  if (!editor) return null;

  const ToolbarButton = ({
    active,
    onClick,
    icon,
    label,
  }: {
    active: boolean;
    onClick: () => void;
    icon: ReactNode;
    label: string;
  }) => (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={label}
      className={cn(
        "h-7 w-7 flex items-center justify-center rounded transition-colors disabled:opacity-50",
        active ? "bg-accent/20 text-accent" : "text-muted-foreground hover:text-white hover:bg-white/10"
      )}
    >
      {icon}
    </button>
  );

  return (
    <div className="rounded-md border border-white/10 bg-background/50 overflow-hidden">
      <div className="flex items-center gap-1 border-b border-white/10 px-2 py-1.5">
        <ToolbarButton
          active={editor.isActive("bold")}
          onClick={() => editor.chain().focus().toggleBold().run()}
          icon={<Bold className="h-3.5 w-3.5" />}
          label="Negrita"
        />
        <ToolbarButton
          active={editor.isActive("italic")}
          onClick={() => editor.chain().focus().toggleItalic().run()}
          icon={<Italic className="h-3.5 w-3.5" />}
          label="Cursiva"
        />
        <ToolbarButton
          active={editor.isActive("underline")}
          onClick={() => editor.chain().focus().toggleUnderline().run()}
          icon={<UnderlineIcon className="h-3.5 w-3.5" />}
          label="Subrayado"
        />
        <ToolbarButton
          active={editor.isActive("heading", { level: 2 })}
          onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
          icon={<Heading2 className="h-3.5 w-3.5" />}
          label="Título"
        />
        <ToolbarButton
          active={editor.isActive("bulletList")}
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          icon={<List className="h-3.5 w-3.5" />}
          label="Lista"
        />
        <ToolbarButton
          active={editor.isActive("orderedList")}
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
          icon={<ListOrdered className="h-3.5 w-3.5" />}
          label="Lista numerada"
        />
        <ToolbarButton
          active={false}
          onClick={() => {
            const url = window.prompt("URL de la imagen");
            if (url) editor.chain().focus().setImage({ src: url }).run();
          }}
          icon={<ImagePlus className="h-3.5 w-3.5" />}
          label="Insertar imagen"
        />
      </div>
      <EditorContent editor={editor} />
    </div>
  );
}
