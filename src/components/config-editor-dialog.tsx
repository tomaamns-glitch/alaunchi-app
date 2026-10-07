import { useEffect, useMemo, useState } from "react";
import { Braces, FileText, Loader2, Lock, RotateCcw, Search } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { configFormatFor, humanizeKey, parseConfig, type ConfigField, type FieldValue, type ParsedConfig } from "@/lib/config-file";

const FORMAT_LABEL = { json: "JSON", properties: "Properties", toml: "TOML" } as const;

/**
 * Opens a file for editing: config files (JSON, .properties, TOML) as a form
 * — one input per option, typed (true/false, number, text, list), grouped by
 * section, with the file's own comments as help — anything else (or a config
 * that doesn't parse) as plain text. "Ver como texto" switches at any time.
 * Saving writes the edited values into the original text (lib/config-file.ts).
 */
export function ConfigEditorDialog({
  path,
  content,
  loading,
  saving,
  onSave,
  onClose,
}: {
  /** Remote path; null = closed. */
  path: string | null;
  content: string;
  loading: boolean;
  saving: boolean;
  onSave: (text: string) => void;
  onClose: () => void;
}) {
  const fileName = path?.split("/").pop() ?? "";
  const format = configFormatFor(fileName);
  const [text, setText] = useState(content);
  const [mode, setMode] = useState<"form" | "text">("form");
  const [edits, setEdits] = useState<Record<string, FieldValue>>({});
  const [filter, setFilter] = useState("");

  // New file (or freshly loaded content): start over from it.
  useEffect(() => {
    setText(content);
    setEdits({});
    setFilter("");
    setMode("form");
  }, [path, content]);

  const parsed: ParsedConfig | null = useMemo(() => (format ? parseConfig(text, format) : null), [text, format]);
  const formAvailable = !!parsed && parsed.fields.length > 0;
  const showForm = mode === "form" && formAvailable;
  const changed = Object.keys(edits).length;

  const groups = useMemo(() => {
    const out = new Map<string, ConfigField[]>();
    const q = filter.trim().toLowerCase();
    for (const f of parsed?.fields ?? []) {
      if (q && !`${f.label} ${f.key} ${f.help ?? ""} ${f.section.join(" ")}`.toLowerCase().includes(q)) continue;
      const key = f.section.join(" › ");
      if (!out.has(key)) out.set(key, []);
      out.get(key)!.push(f);
    }
    return out;
  }, [parsed, filter]);

  const setValue = (f: ConfigField, value: FieldValue) =>
    setEdits((prev) => {
      const next = { ...prev };
      if (JSON.stringify(value) === JSON.stringify(f.value)) delete next[f.id];
      else next[f.id] = value;
      return next;
    });

  /** Text with the form's pending edits applied. */
  const currentText = () => (parsed && changed > 0 ? parsed.apply(edits) : text);

  const switchMode = (next: "form" | "text") => {
    if (next === mode) return;
    if (next === "text") {
      setText(currentText());
      setEdits({});
    }
    setMode(next);
  };

  const save = () => onSave(showForm ? currentText() : text);
  const dirty = showForm ? changed > 0 : text !== content;

  return (
    <Dialog open={!!path} onOpenChange={(open) => !open && !saving && onClose()}>
      <DialogContent className="bg-card border-white/10 text-foreground max-w-3xl sm:max-w-3xl w-[92vw] h-[82vh] p-0 gap-0 flex flex-col overflow-hidden">
        <DialogHeader className="px-5 pt-4 pb-3 border-b border-white/5 shrink-0 space-y-2">
          <DialogTitle className="text-white flex items-center gap-2 min-w-0">
            {showForm ? <Braces className="h-4 w-4 text-accent shrink-0" /> : <FileText className="h-4 w-4 text-accent shrink-0" />}
            <span className="truncate">{fileName}</span>
            {format && formAvailable && (
              <span className="shrink-0 text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-white/10 text-gray-300">{FORMAT_LABEL[format]}</span>
            )}
          </DialogTitle>
          <DialogDescription className="font-mono text-[11px] truncate">{path}</DialogDescription>
          {!loading && (
            <div className="flex items-center gap-2">
              {showForm ? (
                <div className="relative flex-1">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                  <Input
                    value={filter}
                    onChange={(e) => setFilter(e.target.value)}
                    placeholder={`Buscar entre ${parsed!.fields.length} opciones...`}
                    className="h-8 pl-8 bg-background/50 border-white/10 text-sm"
                  />
                </div>
              ) : (
                <p className="flex-1 text-xs text-muted-foreground">
                  {format && !formAvailable ? "No se ha podido interpretar como configuración: se edita como texto." : "Editor de texto"}
                </p>
              )}
              {formAvailable && (
                <div className="flex p-0.5 rounded-lg bg-white/[0.05] border border-white/5 shrink-0">
                  {(["form", "text"] as const).map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => switchMode(m)}
                      className={cn(
                        "px-2.5 py-1 rounded-md text-xs font-semibold transition-colors",
                        mode === m ? "bg-accent text-accent-foreground" : "text-gray-300 hover:bg-white/5"
                      )}
                    >
                      {m === "form" ? "Formulario" : "Ver como texto"}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </DialogHeader>

        <div className="flex-1 min-h-0 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center h-full">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : showForm ? (
            <div className="p-4 space-y-5">
              {groups.size === 0 && <p className="text-sm text-muted-foreground text-center py-10">Ninguna opción coincide.</p>}
              {[...groups.entries()].map(([section, fields]) => (
                <section key={section || "_root"} className="space-y-1.5">
                  {section && (
                    <h3 className="px-1 text-[11px] font-bold uppercase tracking-wide text-accent">
                      {section.split(" › ").map(humanizeKey).join(" › ")}
                    </h3>
                  )}
                  <div className="rounded-xl border border-white/10 bg-card/40 divide-y divide-white/5">
                    {fields.map((f) => (
                      <FieldRow
                        key={f.id}
                        field={f}
                        value={f.id in edits ? edits[f.id] : f.value}
                        changed={f.id in edits}
                        onChange={(v) => setValue(f, v)}
                        onReset={() => setValue(f, f.value)}
                      />
                    ))}
                  </div>
                </section>
              ))}
            </div>
          ) : (
            <Textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              className="font-mono text-xs h-full min-h-full resize-none rounded-none border-0 bg-background/40 focus-visible:ring-0 select-text"
              spellCheck={false}
            />
          )}
        </div>

        <div className="px-5 py-3 border-t border-white/5 flex items-center justify-end gap-2 shrink-0">
          {showForm && changed > 0 && (
            <span className="mr-auto text-xs text-accent font-medium">
              {changed} cambio{changed !== 1 ? "s" : ""} sin guardar
            </span>
          )}
          <Button variant="outline" className="border-white/10" onClick={onClose} disabled={saving}>
            Cancelar
          </Button>
          <Button onClick={save} disabled={loading || saving || !dirty} className="bg-accent hover:bg-accent/90 text-accent-foreground font-bold">
            {saving && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
            Guardar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function FieldRow({
  field,
  value,
  changed,
  onChange,
  onReset,
}: {
  field: ConfigField;
  value: FieldValue;
  changed: boolean;
  onChange: (v: FieldValue) => void;
  onReset: () => void;
}) {
  return (
    <div className={cn("flex items-start gap-4 px-3.5 py-2.5", changed && "bg-accent/[0.06]")}>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <p className="text-sm font-medium text-gray-100">{field.label}</p>
          {changed && (
            <button type="button" onClick={onReset} title="Deshacer" className="text-muted-foreground hover:text-white">
              <RotateCcw className="h-3 w-3" />
            </button>
          )}
        </div>
        <p className="font-mono text-[10px] text-muted-foreground/80 select-text">{field.key}</p>
        {field.help && <p className="mt-0.5 text-[11px] text-muted-foreground leading-snug select-text">{field.help}</p>}
      </div>
      <div className="w-60 shrink-0 flex justify-end">
        <FieldControl field={field} value={value} onChange={onChange} />
      </div>
    </div>
  );
}

function FieldControl({ field, value, onChange }: { field: ConfigField; value: FieldValue; onChange: (v: FieldValue) => void }) {
  if (field.kind === "readonly") {
    return (
      <span className="flex items-center gap-1.5 text-sm font-mono text-gray-300 select-text" title="Valor informativo, no editable">
        <Lock className="h-3 w-3 text-muted-foreground" />
        {String(value)}
      </span>
    );
  }
  if (field.kind === "complex") {
    return (
      <span className="text-[11px] text-muted-foreground text-right" title={field.raw}>
        Valor complejo — edítalo en "Ver como texto"
      </span>
    );
  }
  if (field.kind === "boolean") {
    return (
      <div className="flex p-0.5 rounded-lg bg-white/[0.05] border border-white/10">
        {[false, true].map((b) => (
          <button
            key={String(b)}
            type="button"
            onClick={() => onChange(b)}
            className={cn(
              "px-3 py-1 rounded-md text-xs font-mono font-semibold transition-colors",
              value === b ? (b ? "bg-green-600 text-white" : "bg-white/15 text-white") : "text-muted-foreground hover:bg-white/5"
            )}
          >
            {String(b)}
          </button>
        ))}
      </div>
    );
  }
  if (field.kind === "number") {
    return (
      <NumberInput value={value as number} onChange={onChange} />
    );
  }
  if (field.kind === "list") {
    const items = value as Array<string | number>;
    return (
      <Input
        value={items.join(", ")}
        onChange={(e) => {
          const parts = e.target.value.split(",").map((s) => s.trim()).filter((s) => s !== "");
          onChange(field.listItem === "number" ? parts.map(Number).filter((n) => Number.isFinite(n)) : parts);
        }}
        placeholder="valor1, valor2..."
        title="Lista: separa los valores con comas"
        className="h-8 bg-background/50 border-white/10 font-mono text-xs"
      />
    );
  }
  return (
    <Input
      value={String(value)}
      onChange={(e) => onChange(e.target.value)}
      className="h-8 bg-background/50 border-white/10 font-mono text-xs"
    />
  );
}

/** Keeps the typed text while it's not a valid number yet ("-", "1."), commits when it is. */
function NumberInput({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);
  return (
    <Input
      type="text"
      inputMode="decimal"
      value={draft}
      onChange={(e) => {
        setDraft(e.target.value);
        const n = Number(e.target.value);
        if (e.target.value.trim() !== "" && Number.isFinite(n)) onChange(n);
      }}
      onBlur={() => setDraft(String(value))}
      className="h-8 w-32 bg-background/50 border-white/10 font-mono text-xs text-right"
    />
  );
}
