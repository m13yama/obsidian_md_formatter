import diff from "fast-diff";
import type { Editor, EditorPosition } from "obsidian";

export interface TextEdit {
  from: number;
  to: number;
  text: string;
}

export function computeEdits(before: string, after: string): TextEdit[] {
  const edits: TextEdit[] = [];
  let offset = 0;
  for (const [kind, text] of diff(before, after)) {
    if (kind === diff.EQUAL) {
      offset += text.length;
      continue;
    }
    let edit = edits[edits.length - 1];
    if (!edit || edit.to !== offset) {
      edit = { from: offset, to: offset, text: "" };
      edits.push(edit);
    }
    if (kind === diff.DELETE) {
      offset += text.length;
      edit.to = offset;
    } else edit.text += text;
  }
  return edits;
}

export function mapOffset(offset: number, edits: TextEdit[]): number {
  let delta = 0;
  for (const edit of edits) {
    if (offset < edit.from) break;
    if (offset <= edit.to) return edit.from + delta + edit.text.length;
    delta += edit.text.length - (edit.to - edit.from);
  }
  return offset + delta;
}

export function positionAt(text: string, offset: number): EditorPosition {
  const prefix = text.slice(0, Math.max(0, Math.min(offset, text.length)));
  const lines = prefix.split("\n");
  return { line: lines.length - 1, ch: lines[lines.length - 1]!.length };
}

export function applyToEditor(
  editor: Editor,
  before: string,
  after: string,
): void {
  const edits = computeEdits(before, after);
  if (!edits.length) return;
  const selections = editor.listSelections().map(({ anchor, head }) => ({
    anchor: positionAt(after, mapOffset(editor.posToOffset(anchor), edits)),
    head: positionAt(after, mapOffset(editor.posToOffset(head), edits)),
  }));
  const scroll = editor.getScrollInfo();
  editor.transaction(
    {
      changes: edits.map((edit) => ({
        from: editor.offsetToPos(edit.from),
        to: editor.offsetToPos(edit.to),
        text: edit.text,
      })),
    },
    "prettier-md-formatter",
  );
  editor.setSelections(selections);
  editor.scrollTo(scroll.left, scroll.top);
}
