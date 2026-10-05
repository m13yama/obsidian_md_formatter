// The browser build resolves this public utility to Prettier's standalone bundle.
import { util } from "prettier";

/** Mask Obsidian extensions before Prettier sees them, then restore verbatim. */
export function protectObsidian(
  source: string,
  preserveCallouts = true,
): {
  text: string;
  restore: (text: string) => string;
} {
  let markerCodePoint = 0xe000;
  const nextMarker = (): string => {
    // A single private-use character keeps even short tokens at their original width.
    // Skip any characters already in the note so restoration cannot replace user text.
    while (markerCodePoint <= 0x10fffd) {
      if (markerCodePoint === 0xf900) markerCodePoint = 0xf0000;
      if (markerCodePoint === 0xffffe) markerCodePoint = 0x100000;
      const marker = String.fromCodePoint(markerCodePoint++);
      if (!source.includes(marker)) return marker;
    }
    throw new Error("Obsidian記法の保護用マーカーを確保できませんでした。");
  };
  const entries: { token: string; value: string; indent?: string }[] = [];
  const stash = (value: string, block = false, indent?: string) => {
    // Preserve display width, not UTF-16 length: Japanese/fullwidth text takes
    // two columns, while ASCII and halfwidth kana take one. Do not truncate
    // long inline tokens, since that would also shorten their table columns.
    const marker = nextMarker();
    const id = block
      ? marker
      : marker +
        "Z".repeat(
          Math.max(0, util.getStringWidth(value) - util.getStringWidth(marker)),
        );
    const token = block ? `<!--${id}-->` : id;
    entries.push({ token, value, indent });
    return token;
  };

  // A fenced block and inline code must be consumed before extension tokens.
  // Callouts are kept as whole blocks after formatting their body blocks:
  // prose wrapping can otherwise merge the title and body.
  const tokens = new RegExp(
    [
      /(?<fence>^[ \t]*(?:>[ \t]*)*(?:[-+*] |\d+[.)] )?(?<fenceMarker>`{3,}|~{3,})[^\n]*\n[\s\S]*?(?:^[ \t]*(?:>[ \t]*)*\k<fenceMarker>[`~]*[^\S\n]*$|(?![\s\S])))/
        .source,
      /(?<inline>`+)(?!`)[\s\S]*?(?<!`)\k<inline>(?!`)/.source,
      ...(preserveCallouts
        ? [
            /(?<callout>^(?<indent>[ \t]*)(?<listMarker>(?:[-+*]|\d+[.)])[ \t]+)?>[^\n]*\[![^\]\n]+\][^\n]*(?:\n\k<indent>[ \t]*>[^\n]*)*)/
              .source,
          ]
        : []),
      /%%[\s\S]*?%%|<%[\s\S]*?%>|\$\$[\s\S]*?\$\$|(?<![\\\w$])\$(?!\s|\$)(?:\\.|[^$\n])*?[^\s\\]\$(?!\w)|==(?=\S)[^\n]*?\S==/
        .source,
    ].join("|"),
    "gm",
  );
  const text = source.replace(tokens, (value, ...args) => {
    const { fence, inline, callout, indent, listMarker } = args[
      args.length - 1
    ] as Record<string, string | undefined>;
    const offset = args[args.length - 3] as number;
    if (fence || inline) return value;
    if (callout) {
      const prefix = (indent ?? "") + (listMarker ?? "");
      return (
        prefix +
        stash(value.slice(prefix.length), true, prefix.replace(/\S/g, " "))
      );
    }
    const before = source.slice(
      source.lastIndexOf("\n", offset - 1) + 1,
      offset,
    );
    const lineEnd = source.indexOf("\n", offset + value.length);
    const after = source.slice(
      offset + value.length,
      lineEnd === -1 ? source.length : lineEnd,
    );
    const standalone =
      (!before.trim() ||
        (!preserveCallouts && /^[ \t]*(?:>[ \t]*)+$/.test(before))) &&
      !after.trim();
    const block =
      standalone && (value.includes("\n") || value.startsWith("$$"));
    return stash(value, block, block ? before : undefined);
  });

  return {
    text,
    restore(formatted) {
      for (const { token, value, indent } of entries) {
        if (formatted.split(token).length !== 2) {
          throw new Error(
            "Obsidian記法の保護に失敗したため、変更を適用しませんでした。",
          );
        }
        let restored = value;
        if (indent !== undefined) {
          // Prettier may reduce a list's indentation around the placeholder.
          // Move every continuation line with its header when restoring it.
          const offset = formatted.indexOf(token);
          const prefix = formatted.slice(
            formatted.lastIndexOf("\n", offset - 1) + 1,
            offset,
          );
          const newIndent = indent.includes(">")
            ? prefix
            : prefix.replace(/\S/g, " ");
          restored = value
            .split("\n")
            .map((line, index) =>
              index > 0 && line.startsWith(indent)
                ? newIndent + line.slice(indent.length)
                : line,
            )
            .join("\n");
          // A callout match may include the CR before its final newline.
          // Avoid duplicating it when Prettier also emits CRLF after the marker.
          if (
            restored.endsWith("\r") &&
            formatted[offset + token.length] === "\r"
          ) {
            restored = restored.slice(0, -1);
          }
        }
        formatted = formatted.replace(token, () => restored);
      }
      return formatted;
    },
  };
}
