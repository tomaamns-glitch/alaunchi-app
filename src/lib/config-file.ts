/**
 * Turns a config file (JSON, .properties, TOML) into a list of typed fields a
 * form can show — and writes edited values back INTO THE ORIGINAL TEXT, so a
 * save only changes the values that were touched: comments, key order and
 * formatting stay as they were (JSON is re-serialized, keeping key order and
 * the file's own indentation).
 *
 * Anything it can't safely round-trip (multi-line values, arrays of objects,
 * inline tables…) becomes a read-only "complex" field — edit those in the
 * plain-text view. A file that doesn't parse returns null (→ text editor).
 */

const NL = String.fromCharCode(10);

export type ConfigFormat = "json" | "properties" | "toml";
export type FieldKind = "boolean" | "number" | "string" | "list" | "readonly" | "complex";
export type FieldValue = string | number | boolean | Array<string | number>;

export interface ConfigField {
  /** Stable id: JSON path for JSON, line number for line-based formats. */
  id: string;
  key: string;
  label: string;
  /** Section path ([] = top level), for grouping. */
  section: string[];
  kind: FieldKind;
  value: FieldValue;
  /** Item type of a "list" field. */
  listItem?: "string" | "number";
  /** Comment written above the option in the file. */
  help?: string;
  /** Raw text, for read-only/complex fields. */
  raw?: string;
}

export interface ParsedConfig {
  format: ConfigFormat;
  fields: ConfigField[];
  /** New file text with `values` (by field id) applied; untouched fields keep their text. */
  apply: (values: Record<string, FieldValue>) => string;
}

export function configFormatFor(fileName: string): ConfigFormat | null {
  const ext = fileName.toLowerCase().split(".").pop();
  if (ext === "json" || ext === "mcmeta") return "json";
  if (ext === "properties") return "properties";
  if (ext === "toml") return "toml";
  return null;
}

/** "continueOnRestart" / "max_players" / "view-distance" → "Continue on restart". */
export function humanizeKey(key: string): string {
  const words = key
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
    .replace(/[_\-.]+/g, " ")
    .trim()
    .split(/\s+/);
  if (words.length === 0 || !words[0]) return key;
  return [words[0].charAt(0).toUpperCase() + words[0].slice(1), ...words.slice(1).map((w) => (/^[A-Z0-9]{2,}$/.test(w) ? w : w.toLowerCase()))].join(" ");
}

/** Versions of the file's own schema: shown, never edited. */
const READONLY_KEY = /^_?(config[_-]?|schema[_-]?|file[_-]?)?version$/i;

function inferScalar(raw: string): { kind: "boolean" | "number" | "string"; value: string | number | boolean } {
  const t = raw.trim();
  if (t === "true" || t === "false") return { kind: "boolean", value: t === "true" };
  if (/^-?\d+(\.\d+)?([eE][+-]?\d+)?$/.test(t)) return { kind: "number", value: Number(t) };
  return { kind: "string", value: raw };
}

export function parseConfig(text: string, format: ConfigFormat): ParsedConfig | null {
  try {
    if (format === "json") return parseJson(text);
    if (format === "properties") return parseProperties(text);
    return parseToml(text);
  } catch {
    return null;
  }
}

// ─── JSON ─────────────────────────────────────────────────────────────────────

function parseJson(text: string): ParsedConfig | null {
  const data = JSON.parse(text);
  if (data === null || typeof data !== "object" || Array.isArray(data)) return null;
  const fields: ConfigField[] = [];

  const walk = (obj: Record<string, unknown>, path: string[]) => {
    for (const [key, v] of Object.entries(obj)) {
      const p = [...path, key];
      const id = JSON.stringify(p);
      const base = { id, key, label: humanizeKey(key), section: path };
      if (v !== null && typeof v === "object" && !Array.isArray(v)) {
        walk(v as Record<string, unknown>, p);
      } else if (Array.isArray(v)) {
        if (v.every((x) => typeof x === "string")) fields.push({ ...base, kind: "list", listItem: "string", value: v as string[] });
        else if (v.every((x) => typeof x === "number")) fields.push({ ...base, kind: "list", listItem: "number", value: v as number[] });
        else fields.push({ ...base, kind: "complex", value: "", raw: JSON.stringify(v) });
      } else if (typeof v === "boolean") {
        fields.push({ ...base, kind: READONLY_KEY.test(key) ? "readonly" : "boolean", value: v });
      } else if (typeof v === "number") {
        fields.push({ ...base, kind: READONLY_KEY.test(key) ? "readonly" : "number", value: v });
      } else if (typeof v === "string") {
        fields.push({ ...base, kind: READONLY_KEY.test(key) ? "readonly" : "string", value: v });
      } else {
        fields.push({ ...base, kind: "complex", value: "", raw: JSON.stringify(v) });
      }
    }
  };
  walk(data, []);

  // Keep the file's own indentation and trailing newline.
  const indentMatch = text.match(/\n([ \t]+)"/);
  const indent = indentMatch ? (indentMatch[1].includes("\t") ? "\t" : indentMatch[1].length) : 2;
  const trailingNewline = /\r?\n$/.test(text) ? (text.includes("\r\n") ? "\r\n" : "\n") : "";

  return {
    format: "json",
    fields,
    apply: (values) => {
      const copy = JSON.parse(text);
      for (const [id, value] of Object.entries(values)) {
        const path = JSON.parse(id) as string[];
        let node = copy;
        for (const k of path.slice(0, -1)) node = node[k];
        node[path[path.length - 1]] = value;
      }
      let out = JSON.stringify(copy, null, indent);
      if (text.includes("\r\n")) out = out.replace(/\n/g, "\r\n");
      return out + trailingNewline;
    },
  };
}

// ─── .properties ──────────────────────────────────────────────────────────────

function parseProperties(text: string): ParsedConfig | null {
  const eol = text.includes("\r\n") ? "\r\n" : "\n";
  const lines = text.split(/\r?\n/);
  const fields: ConfigField[] = [];
  const prefixes = new Map<string, string>();
  let comment: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const t = line.trim();
    if (!t) {
      comment = [];
      continue;
    }
    if (t.startsWith("#") || t.startsWith("!")) {
      comment.push(t.replace(/^[#!]\s?/, ""));
      continue;
    }
    const m = line.match(/^(\s*)((?:\\.|[^=:\s\\])+)(\s*[=:]\s*|\s+)(.*)$/);
    if (!m) {
      comment = [];
      continue;
    }
    const [, lead, key, sep, rawValue] = m;
    const id = String(i);
    const help = comment.filter((c) => !/^minecraft server properties$/i.test(c) && !/^\w{3} \w{3} \d+/.test(c)).join(" ") || undefined;
    comment = [];
    const base = { id, key, label: humanizeKey(key), section: [] as string[], help };
    if (rawValue.endsWith("\\")) {
      fields.push({ ...base, kind: "complex", value: "", raw: rawValue });
      continue;
    }
    prefixes.set(id, lead + key + sep);
    const s = inferScalar(rawValue);
    fields.push({ ...base, kind: READONLY_KEY.test(key) ? "readonly" : s.kind, value: s.value });
  }

  return {
    format: "properties",
    fields,
    apply: (values) => {
      const out = [...lines];
      for (const [id, value] of Object.entries(values)) {
        const prefix = prefixes.get(id);
        if (prefix === undefined) continue;
        // Escape what .properties treats specially at the start of a value.
        const v = String(value).replace(/\\/g, "\\\\").replace(/^\s+/, (s) => s.replace(/ /g, "\\ "));
        out[Number(id)] = prefix + v;
      }
      return out.join(eol);
    },
  };
}

// ─── TOML ─────────────────────────────────────────────────────────────────────

/** Splits `value  # comment` without cutting a # inside a string. */
function splitTomlValue(rest: string): { value: string; comment: string } {
  let inStr: string | null = null;
  for (let i = 0; i < rest.length; i++) {
    const c = rest[i];
    if (inStr) {
      if (c === "\\" && inStr === '"') i++;
      else if (c === inStr) inStr = null;
    } else if (c === '"' || c === "'") inStr = c;
    else if (c === "#") {
      const value = rest.slice(0, i);
      return { value: value.trimEnd(), comment: rest.slice(value.trimEnd().length) };
    }
  }
  return { value: rest.trimEnd(), comment: rest.slice(rest.trimEnd().length) };
}

function parseTomlScalar(v: string): { kind: "boolean" | "number" | "string"; value: string | number | boolean; quote?: string } | null {
  if (v === "true" || v === "false") return { kind: "boolean", value: v === "true" };
  if (/^[+-]?(\d[\d_]*)(\.\d[\d_]*)?([eE][+-]?\d+)?$/.test(v)) return { kind: "number", value: Number(v.replace(/_/g, "")) };
  if (v.startsWith('"') && v.endsWith('"') && v.length >= 2 && !v.startsWith('"""')) {
    try {
      return { kind: "string", value: JSON.parse(v), quote: '"' };
    } catch {
      return null;
    }
  }
  if (v.startsWith("'") && v.endsWith("'") && v.length >= 2 && !v.startsWith("'''")) return { kind: "string", value: v.slice(1, -1), quote: "'" };
  return null;
}

function splitTomlArray(inner: string): string[] | null {
  const items: string[] = [];
  let cur = "";
  let inStr: string | null = null;
  for (let i = 0; i < inner.length; i++) {
    const c = inner[i];
    if (inStr) {
      cur += c;
      if (c === "\\" && inStr === '"') cur += inner[++i] ?? "";
      else if (c === inStr) inStr = null;
    } else if (c === '"' || c === "'") {
      inStr = c;
      cur += c;
    } else if (c === "[" || c === "{") return null; // nested — not a simple list
    else if (c === ",") {
      items.push(cur.trim());
      cur = "";
    } else cur += c;
  }
  if (cur.trim()) items.push(cur.trim());
  return items;
}

function parseToml(text: string): ParsedConfig | null {
  const eol = text.includes("\r\n") ? "\r\n" : "\n";
  const lines = text.split(/\r?\n/);
  const fields: ConfigField[] = [];
  const meta = new Map<string, { lead: string; comment: string; quote?: string }>();
  let section: string[] = [];
  let arrayTable = false;
  let comment: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const t = line.trim();
    if (!t) {
      comment = [];
      continue;
    }
    if (t.startsWith("#")) {
      comment.push(t.replace(/^#\s?/, ""));
      continue;
    }
    const header = t.match(/^\[(\[)?\s*([^\]]+?)\s*\]\]?\s*(#.*)?$/);
    if (header) {
      arrayTable = !!header[1];
      section = header[2].split(".").map((s) => s.trim().replace(/^["']|["']$/g, ""));
      comment = [];
      continue;
    }
    const m = line.match(/^(\s*)("[^"]*"|'[^']*'|[A-Za-z0-9_\-.]+)(\s*=\s*)(.*)$/);
    if (!m) return null; // something this parser doesn't understand → text editor
    const [, indent, rawKey, eq, rest] = m;
    const key = rawKey.replace(/^["']|["']$/g, "");
    const { value, comment: trailing } = splitTomlValue(rest);
    const id = String(i);
    const help = comment.join(" ") || undefined;
    comment = [];
    const base = { id, key, label: humanizeKey(key), section, help };

    if (arrayTable) {
      fields.push({ ...base, kind: "complex", value: "", raw: value });
      continue;
    }
    // Inline tables and multi-line arrays/strings: read-only, and skip their
    // continuation lines so they aren't parsed as keys.
    const tripleQuote = value.startsWith('"""') ? '"""' : value.startsWith("'''") ? "'''" : null;
    const multilineArray = value.startsWith("[") && !value.endsWith("]");
    const unclosedTriple = tripleQuote !== null && (value.length < 6 || !value.endsWith(tripleQuote));
    if (value.startsWith("{") || multilineArray || tripleQuote) {
      let raw = value;
      const closes = (l: string) => (multilineArray ? l.trimEnd().endsWith("]") : tripleQuote ? l.includes(tripleQuote) : l.trimEnd().endsWith("}"));
      const spans = multilineArray || unclosedTriple || (value.startsWith("{") && !value.endsWith("}"));
      while (spans && i + 1 < lines.length) {
        i++;
        raw += NL + lines[i];
        if (closes(lines[i])) break;
      }
      fields.push({ ...base, kind: "complex", value: "", raw });
      continue;
    }

    const lead = indent + rawKey + eq;
    if (value.startsWith("[")) {
      const items = splitTomlArray(value.slice(1, -1));
      const scalars = items?.map(parseTomlScalar) ?? null;
      if (scalars && scalars.every((s) => s && s.kind === "string")) {
        meta.set(id, { lead, comment: trailing, quote: scalars[0]?.quote ?? '"' });
        fields.push({ ...base, kind: "list", listItem: "string", value: scalars.map((s) => s!.value as string) });
      } else if (scalars && scalars.every((s) => s && s.kind === "number")) {
        meta.set(id, { lead, comment: trailing });
        fields.push({ ...base, kind: "list", listItem: "number", value: scalars.map((s) => s!.value as number) });
      } else {
        fields.push({ ...base, kind: "complex", value: "", raw: value });
      }
      continue;
    }
    const scalar = parseTomlScalar(value);
    if (!scalar) {
      fields.push({ ...base, kind: "complex", value: "", raw: value });
      continue;
    }
    meta.set(id, { lead, comment: trailing, quote: scalar.quote });
    fields.push({ ...base, kind: READONLY_KEY.test(key) ? "readonly" : scalar.kind, value: scalar.value });
  }

  const tomlString = (s: string, quote?: string) => (quote === "'" && !s.includes("'") && !/[\n\r]/.test(s) ? `'${s}'` : JSON.stringify(s));
  return {
    format: "toml",
    fields,
    apply: (values) => {
      const out = [...lines];
      for (const [id, value] of Object.entries(values)) {
        const m = meta.get(id);
        if (!m) continue;
        let v: string;
        if (Array.isArray(value)) v = `[${value.map((x) => (typeof x === "number" ? String(x) : tomlString(x, m.quote))).join(", ")}]`;
        else if (typeof value === "string") v = tomlString(value, m.quote);
        else v = String(value);
        out[Number(id)] = m.lead + v + m.comment;
      }
      return out.join(eol);
    },
  };
}
