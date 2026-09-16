import assert from "node:assert/strict";
import { test } from "node:test";
import type { Editor } from "obsidian";
import {
  applyToEditor,
  computeEdits,
  mapOffset,
  positionAt,
} from "../src/editor";

test("diff changes reconstruct text without replacing unchanged regions", () => {
  for (const [before, after] of [
    ["#  Title\n\n*   item", "# Title\n\n- item\n"],
    ["", "hi"],
    ["hello", ""],
    ["日本語😀の文章", "日本語 😀 の文章\n"],
  ]) {
    const edits = computeEdits(before!, after!);
    let result = before!;
    for (const edit of [...edits].reverse())
      result = result.slice(0, edit.from) + edit.text + result.slice(edit.to);
    assert.equal(result, after);
  }
});

test("maps the caret at unchanged text through surrounding whitespace changes", () => {
  const before = "#  Title\n\n*   item";
  const after = "# Title\n\n- item\n";
  const edits = computeEdits(before, after);
  assert.equal(mapOffset(before.indexOf("itle"), edits), after.indexOf("itle"));
  assert.equal(mapOffset(before.indexOf("tem"), edits), after.indexOf("tem"));
  assert.deepEqual(positionAt(after, after.indexOf("item")), {
    line: 2,
    ch: 2,
  });
});

test("applies a single transaction and retains multiple selections and scrolling", () => {
  let content = "#  Title\n\n*   item";
  let transactions = 0;
  let selections: unknown;
  let scroll: unknown;
  const editor = {
    listSelections: () => [
      { anchor: { line: 0, ch: 4 }, head: { line: 0, ch: 5 } },
      { anchor: { line: 2, ch: 5 }, head: { line: 2, ch: 5 } },
    ],
    posToOffset: ({ line, ch }: { line: number; ch: number }) =>
      content
        .split("\n")
        .slice(0, line)
        .reduce((n, text) => n + text.length + 1, 0) + ch,
    offsetToPos: (offset: number) => positionAt(content, offset),
    getScrollInfo: () => ({ top: 120, left: 8 }),
    transaction: () => {
      transactions++;
      content = "# Title\n\n- item\n";
    },
    setSelections: (value: unknown) => {
      selections = value;
    },
    scrollTo: (...value: unknown[]) => {
      scroll = value;
    },
  } as unknown as Editor;
  applyToEditor(editor, content, "# Title\n\n- item\n");
  assert.equal(transactions, 1);
  assert.deepEqual(selections, [
    { anchor: { line: 0, ch: 3 }, head: { line: 0, ch: 4 } },
    { anchor: { line: 2, ch: 3 }, head: { line: 2, ch: 3 } },
  ]);
  assert.deepEqual(scroll, [8, 120]);
});
