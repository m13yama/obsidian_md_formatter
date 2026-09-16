// The browser build resolves this public utility to Prettier's standalone bundle.
import { util } from "prettier";

/** Mask Obsidian extensions before Prettier sees them, then restore verbatim. */
export function protectObsidian(source: string): {
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
  const entries: { token: string; value: string }[] = [];
  const stash = (value: string, block = false) => {
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
    entries.push({ token, value });
    return token;
  };

  // A fenced block and inline code must be consumed before extension tokens.
  // Callouts are kept as whole blocks: prose wrapping can otherwise merge the title and body.
  const tokens =
    /(^[ \t]*(?:>[ \t]*)*(?:[-+*] |\d+[.)] )?(`{3,}|~{3,})[^\n]*\n[\s\S]*?(?:^[ \t]*(?:>[ \t]*)*\2[`~]*[^\S\n]*$|(?![\s\S])))|(`+)(?!`)[\s\S]*?(?<!`)\3(?!`)|(^([ \t]*)>[^\n]*\[![^\]\n]+\][^\n]*(?:\n\5>[^\n]*)*)|%%[\s\S]*?%%|<%[\s\S]*?%>|\$\$[\s\S]*?\$\$|(?<![\\\w$])\$(?!\s|\$)(?:\\.|[^$\n])*?[^\s\\]\$(?!\w)|==(?=\S)[^\n]*?\S==/gm;
  const text = source.replace(
    tokens,
    (
      value,
      fence: string | undefined,
      _marker,
      inline: string | undefined,
      callout: string | undefined,
      indent: string | undefined,
      offset: number,
    ) => {
      if (fence || inline) return value;
      if (callout)
        return (indent ?? "") + stash(value.slice((indent ?? "").length), true);
      const before = source.slice(
        source.lastIndexOf("\n", offset - 1) + 1,
        offset,
      );
      const lineEnd = source.indexOf("\n", offset + value.length);
      const after = source.slice(
        offset + value.length,
        lineEnd === -1 ? source.length : lineEnd,
      );
      const standalone = !before.trim() && !after.trim();
      return stash(
        value,
        standalone && (value.includes("\n") || value.startsWith("$$")),
      );
    },
  );

  return {
    text,
    restore(formatted) {
      for (const { token, value } of entries) {
        if (formatted.split(token).length !== 2) {
          throw new Error(
            "Obsidian記法の保護に失敗したため、変更を適用しませんでした。",
          );
        }
        formatted = formatted.replace(token, () => value);
      }
      return formatted;
    },
  };
}
