import { format } from "prettier/standalone";
import * as markdown from "prettier/plugins/markdown";
import * as babel from "prettier/plugins/babel";
import * as estree from "prettier/plugins/estree";
import * as typescript from "prettier/plugins/typescript";
import * as html from "prettier/plugins/html";
import * as postcss from "prettier/plugins/postcss";
import * as yaml from "prettier/plugins/yaml";
import type { Options } from "prettier";
import type { FormatterSettings } from "./settings";
import { protectObsidian } from "./protection";

const plugins = [markdown, babel, estree, typescript, html, postcss, yaml];

export async function formatMarkdown(
  source: string,
  settings: FormatterSettings,
  options: Options,
): Promise<string> {
  // Preserve BOM and YAML properties byte-for-byte by default.
  const bom = source.startsWith("\uFEFF") ? "\uFEFF" : "";
  let body = source.slice(bom.length);
  let frontmatter = "";
  if (settings.preserveFrontmatter) {
    const match =
      /^(---[ \t]*\r?\n(?:[\s\S]*?\r?\n)?(?:---|\.\.\.)[ \t]*)(\r?\n|$)/.exec(
        body,
      );
    if (match) {
      frontmatter = match[1]! + (match[2] || "\n");
      body = body.slice(match[0].length);
    }
  }
  const protectedBody = settings.preserveObsidianSyntax
    ? protectObsidian(body)
    : { text: body, restore: (s: string) => s };
  const formatted = await format(protectedBody.text, {
    ...options,
    parser: "markdown",
    plugins,
  });
  return bom + frontmatter + protectedBody.restore(formatted);
}
