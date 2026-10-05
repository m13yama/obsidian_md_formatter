import * as markdown from "prettier/plugins/markdown";
import type { ParserOptions } from "prettier";
import { util } from "prettier";
import { protectObsidian } from "./protection";

interface MarkdownNode {
  type: string;
  value?: string;
  children?: MarkdownNode[];
  position: {
    start: { offset: number };
    end: { offset: number };
  };
}

/** Format body blocks individually so callout headers and boundaries stay intact. */
export async function formatCalloutContent(
  source: string,
  formatBlock: (source: string, prefixWidth: number) => Promise<string>,
  formatCodeBlocks: boolean,
): Promise<string> {
  if (!/^[ \t]*(?:(?:[-+*]|\d+[.)])[ \t]+)?>[^\n]*\[![^\]\n]+\]/m.test(source))
    return source;

  // Keep content inside comments, templates and math out of the AST too.
  const protectedSource = protectObsidian(source, false);
  let text = protectedSource.text;
  const root: MarkdownNode = await markdown.parsers.markdown.parse(text, {
    parser: "markdown",
  } as ParserOptions);
  const blocks: { start: number; end: number; depth: number }[] = [];
  const visit = (node: MarkdownNode, inCallout = false, depth = 0) => {
    const firstChild = node.children?.[0];
    let header: MarkdownNode | undefined;
    if (node.type === "blockquote" && firstChild) {
      depth++;
      if (/^\[![^\]\n]+\]/.test(text.slice(firstChild.position.start.offset))) {
        inCallout = true;
        header = firstChild;
      }
    }
    if (inCallout && node.type !== "blockquote") {
      if (node.type === "code" && !formatCodeBlocks) return;
      blocks.push({
        start: node.position.start.offset,
        end: node.position.end.offset,
        depth,
      });
      return;
    }
    let ignoreNext = false;
    let ignoreRange = false;
    for (const child of node.children ?? []) {
      if (child === header) {
        // Markdown parses the title and following prose as one paragraph.
        // Leave the first physical line untouched, even with proseWrap=never.
        const bodyStart = text.indexOf("\n", child.position.start.offset) + 1;
        if (bodyStart > 0 && bodyStart < child.position.end.offset) {
          blocks.push({
            start: bodyStart,
            end: child.position.end.offset,
            depth,
          });
        }
        continue;
      }
      const directive =
        child.type === "html"
          ? /^<!--\s*prettier-ignore(-start|-end)?\s*-->$/.exec(
              child.value?.trim() ?? "",
            )
          : null;
      if (directive) {
        if (directive[1]) ignoreRange = directive[1] === "-start";
        else ignoreNext = true;
        continue;
      }
      if (!ignoreNext && !ignoreRange) visit(child, inCallout, depth);
      ignoreNext = false;
    }
  };
  visit(root);

  // Work backwards so replacements do not invalidate the remaining AST offsets.
  for (const block of blocks.reverse()) {
    const start = text.lastIndexOf("\n", block.start - 1) + 1;
    let end = block.end;
    const quotePrefix = new RegExp(`^(?:[ \\t]*>[ \\t]?){${block.depth}}`);
    // A list's AST range can include the outer quote prefix of the next block.
    // Keep that line and all existing blank separators outside the replacement.
    while (end > start) {
      const lastLine = text.lastIndexOf("\n", end - 1) + 1;
      if (text.slice(lastLine, end).replace(quotePrefix, "").trim()) break;
      end = lastLine - 1;
      if (text[end - 1] === "\r") end--;
    }
    if (end <= start) continue;
    const lines = text.slice(start, end).split("\n");
    const prefixes = lines.map((line) => quotePrefix.exec(line)?.[0]);
    if (prefixes.some((prefix) => !prefix)) continue;
    const contents = lines.map((line, i) =>
      line.slice(prefixes[i]!.length).replace(/\r$/, ""),
    );
    const formatted = (
      await formatBlock(contents.join("\n"), util.getStringWidth(prefixes[0]!))
    )
      .replace(/\n$/, "")
      .split("\n");
    const eol =
      lines[0]!.endsWith("\r") || text.slice(end, end + 2) === "\r\n"
        ? "\r\n"
        : "\n";
    const replacement = formatted
      .map((line, i) => {
        const prefix =
          formatted.length === lines.length ? prefixes[i]! : prefixes[0]!;
        return line ? prefix + line : prefix.trimEnd();
      })
      .join(eol);
    text = text.slice(0, start) + replacement + text.slice(end);
  }
  return protectedSource.restore(text);
}
