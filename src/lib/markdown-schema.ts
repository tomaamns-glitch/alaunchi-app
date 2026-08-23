import { defaultSchema } from "rehype-sanitize";

// rehype-raw needs an explicit schema to keep inline `style`/`align` — the
// default sanitize schema strips them, but mod descriptions and the changelog
// editor's output both rely on them for layout (centered banners, badge rows).
export const HTML_SANITIZE_SCHEMA = {
  ...defaultSchema,
  attributes: {
    ...defaultSchema.attributes,
    "*": [...(defaultSchema.attributes?.["*"] ?? []), "style", "align"],
  },
};
