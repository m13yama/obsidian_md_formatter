import { format } from "prettier/standalone";
import * as markdown from "prettier/plugins/markdown";
import * as babel from "prettier/plugins/babel";
import * as estree from "prettier/plugins/estree";
import * as typescript from "prettier/plugins/typescript";
import * as html from "prettier/plugins/html";
import * as postcss from "prettier/plugins/postcss";
import * as yaml from "prettier/plugins/yaml";
import type { Options, Plugin } from "prettier";
import type { FormatterSettings } from "./settings";
import { protectObsidian } from "./protection";
import { formatCalloutContent } from "./callout-content";

const markdownWithAutolinks: Plugin = {
  ...markdown,
  printers: {
    mdast: {
      ...markdown.printers.mdast,
      print(path, options, print, args) {
        const node = path.node;
        // Only wrap parsed bare HTTP(S) links. Printing the brackets here lets
        // Prettier account for their width in tables and wrapped paragraphs.
        if (
          node.type === "link" &&
          /^https?:\/\//i.test(node.url) &&
          options.originalText.slice(
            options.locStart(node),
            options.locEnd(node),
          ) === node.url
        ) {
          return `<${node.url}>`;
        }
        return markdown.printers.mdast.print(path, options, print, args);
      },
    },
  },
};

const plugins = [
  markdownWithAutolinks,
  babel,
  estree,
  typescript,
  html,
  postcss,
  yaml,
];

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
  if (settings.preserveObsidianSyntax) {
    body = await formatCalloutContent(
      body,
      (block, prefixWidth) =>
        formatMarkdown(
          block,
          { ...settings, preserveFrontmatter: false },
          {
            ...options,
            printWidth: Math.max(1, (options.printWidth ?? 80) - prefixWidth),
            endOfLine: "lf",
          },
        ),
      options.embeddedLanguageFormatting !== "off",
    );
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
