import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { createRequire } from "node:module";
import { test } from "node:test";
import { buildSync } from "esbuild";
import type {
  Command,
  Editor,
  EditorPosition,
  EditorTransaction,
} from "obsidian";
import type MarkdownFormatterPlugin from "../src/main";
import { positionAt } from "../src/editor";

// Run the real plugin with a small Obsidian host, including real Prettier and edits.
const bundle = buildSync({
  entryPoints: ["src/main.ts"],
  bundle: true,
  packages: "external",
  format: "cjs",
  platform: "node",
  write: false,
}).outputFiles[0]!.text;
const nodeRequire = createRequire(`${process.cwd()}/package.json`);

class TestDocument extends EventTarget {
  defaultView = new EventTarget();

  dispatchEvent(event: Event): boolean {
    // Model window capture before the document, including stopPropagation().
    if (event.type === "keydown") {
      this.defaultView.dispatchEvent(event);
      if (event.cancelBubble) return !event.defaultPrevented;
    }
    return super.dispatchEvent(event);
  }
}

class PluginStub {
  commands = new Map<string, Command>();
  cleanup: (() => void)[] = [];
  constructor(public app: unknown) {}
  async loadData() {
    return {};
  }
  async saveData() {}
  addSettingTab() {}
  addCommand(command: Command) {
    this.commands.set(command.id, command);
  }
  registerEvent() {}
  registerDomEvent(
    target: EventTarget,
    type: string,
    listener: EventListener,
    options?: AddEventListenerOptions,
  ) {
    target.addEventListener(type, listener, options);
    this.cleanup.push(() =>
      target.removeEventListener(type, listener, options),
    );
  }
}

async function setup(stopSavePropagation = false) {
  const doc = new TestDocument();
  const file = { path: "note.md", extension: "md", stat: { size: 10 } };
  const state = {
    buffer: "#  title\n",
    disk: "previous saved text\n",
    focused: true,
    mode: "source",
    saves: [] as string[],
    notices: [] as string[],
    errors: [] as unknown[],
  };
  const offset = ({ line, ch }: EditorPosition) =>
    state.buffer
      .split("\n")
      .slice(0, line)
      .reduce((length, text) => length + text.length + 1, 0) + ch;
  const editor = {
    getValue: () => state.buffer,
    hasFocus: () => state.focused,
    listSelections: () => [],
    offsetToPos: (offset: number) => positionAt(state.buffer, offset),
    getScrollInfo: () => ({ top: 0, left: 0 }),
    transaction: ({ changes = [] }: EditorTransaction) => {
      const edits = changes.map((change) => ({
        from: offset(change.from),
        to: offset(change.to ?? change.from),
        text: change.text,
      }));
      for (const edit of edits.reverse()) {
        state.buffer =
          state.buffer.slice(0, edit.from) +
          edit.text +
          state.buffer.slice(edit.to);
      }
    },
    setSelections: () => {},
    scrollTo: () => {},
  };
  const vault = Object.assign(new EventEmitter(), {
    getAbstractFileByPath: () => file,
    adapter: { read: async () => "{}" },
  });
  class MarkdownViewStub {
    file = file;
    editor = editor;
    containerEl = { ownerDocument: doc };
    getMode = () => state.mode;
    async save() {
      state.disk = state.buffer;
      state.saves.push(state.disk);
      vault.emit("modify", file);
    }
  }
  const view = new MarkdownViewStub();
  const workspace = Object.assign(new EventEmitter(), {
    getActiveViewOfType: () => view,
    iterateAllLeaves: (callback: (leaf: { view: MarkdownViewStub }) => void) =>
      callback({ view }),
  });
  if (stopSavePropagation) {
    // Obsidian registers its save shortcut on window before loading plugins.
    const registerSaveShortcut = (target: TestDocument) => {
      target.defaultView.addEventListener(
        "keydown",
        (event) => {
          const key = event as KeyboardEvent;
          if (
            key.key.toLowerCase() === "s" &&
            (key.ctrlKey || key.metaKey) &&
            !key.altKey &&
            !key.shiftKey
          ) {
            void view.save();
            event.preventDefault();
            event.stopPropagation();
          }
        },
        { capture: true },
      );
    };
    registerSaveShortcut(doc);
    workspace.on("window-open", (_workspaceWindow, win) =>
      registerSaveShortcut(win.document),
    );
  }
  const obsidian = {
    Plugin: PluginStub,
    MarkdownView: MarkdownViewStub,
    PluginSettingTab: class {},
    Notice: class {
      constructor(message: string) {
        state.notices.push(message);
      }
    },
  };
  const module = { exports: {} as { default: typeof MarkdownFormatterPlugin } };
  new Function("require", "module", "document", "console", bundle)(
    (name: string) => (name === "obsidian" ? obsidian : nodeRequire(name)),
    module,
    doc,
    { error: (...args: unknown[]) => state.errors.push(args) },
  );
  const PluginClass = module.exports.default;
  const plugin = new PluginClass({ vault, workspace } as never, {} as never);
  await plugin.onload();
  const registered = plugin as unknown as PluginStub;
  const keydown = (overrides: Partial<KeyboardEvent> = {}, target = doc) => {
    const event = Object.assign(new Event("keydown", { cancelable: true }), {
      key: "s",
      ctrlKey: true,
      metaKey: false,
      shiftKey: false,
      altKey: false,
      repeat: false,
      isComposing: false,
      ...overrides,
    });
    target.dispatchEvent(event);
    // Simulate Obsidian's existing save handler after our capture listener.
    if (!event.defaultPrevented) void view.save();
    return event;
  };
  return {
    doc,
    file,
    state,
    editor,
    view,
    vault,
    workspace,
    plugin,
    commands: registered.commands,
    keydown,
    unload: () => {
      plugin.onunload();
      registered.cleanup.forEach((cleanup) => cleanup());
    },
  };
}

const settle = () => new Promise((resolve) => setImmediate(resolve));

test("autosaves and external modifications never trigger formatting", async () => {
  const { state, view, vault, file, unload } = await setup();
  await view.save();
  vault.emit("modify", file);
  await settle();
  assert.equal(state.buffer, "#  title\n");
  assert.equal(state.disk, "#  title\n");
  assert.equal(vault.listenerCount("modify"), 0);
  unload();
});

test("Ctrl+S and Cmd+S preserve normal saving and save the formatted current buffer", async () => {
  for (const modifiers of [
    { ctrlKey: true, metaKey: false },
    { ctrlKey: false, metaKey: true },
  ]) {
    const { state, keydown, unload } = await setup();
    assert.equal(keydown(modifiers).defaultPrevented, false);
    await settle();
    assert.equal(state.buffer, "# title\n");
    assert.equal(state.disk, "# title\n");
    assert.deepEqual(state.saves, ["#  title\n", "# title\n"]);
    unload();
  }
});

test("Ctrl+S formats an already saved note without needing a file change", async () => {
  const { state, keydown, unload } = await setup();
  state.disk = state.buffer;
  keydown();
  await settle();
  assert.equal(state.disk, "# title\n");
  unload();
});

test("Ctrl+S and Cmd+S still format when Obsidian stops propagation at the window", async () => {
  for (const modifiers of [
    { ctrlKey: true, metaKey: false },
    { ctrlKey: false, metaKey: true },
  ]) {
    const { doc, plugin, state, keydown, unload } = await setup(true);
    let documentEvents = 0;
    doc.addEventListener("keydown", () => documentEvents++);
    assert.equal(keydown(modifiers).defaultPrevented, true);
    await settle();
    assert.equal(documentEvents, 0);
    assert.equal(state.disk, "# title\n");
    assert.deepEqual(state.saves, ["#  title\n", "# title\n"]);

    plugin.settings.formatOnSave = false;
    state.buffer = "#  disabled\n";
    keydown(modifiers);
    await settle();
    assert.equal(state.disk, "#  disabled\n");
    assert.equal(state.saves.length, 3);

    plugin.settings.formatOnSave = true;
    plugin.settings.customOptions = "{";
    state.buffer = "#  invalid config\n";
    keydown(modifiers);
    await settle();
    assert.equal(state.disk, "#  invalid config\n");
    assert.equal(state.saves.length, 4);
    assert.equal(state.errors.length, 1);
    unload();
  }
});

test("other keys, extra modifiers, repeats and IME key events do not format", async () => {
  for (const overrides of [
    { key: "a" },
    { ctrlKey: false },
    { altKey: true },
    { shiftKey: true },
    { metaKey: true },
    { repeat: true },
    { isComposing: true },
  ]) {
    const { state, keydown, unload } = await setup();
    keydown(overrides);
    await settle();
    assert.equal(state.buffer, "#  title\n", JSON.stringify(overrides));
    unload();
  }
});

test("IME completion does not schedule formatting after an autosave or shortcut", async () => {
  const { doc, state, view, keydown, unload } = await setup();
  doc.dispatchEvent(new Event("compositionstart"));
  await view.save();
  keydown();
  doc.dispatchEvent(new Event("compositionend"));
  await settle();
  assert.equal(state.buffer, "#  title\n");
  keydown();
  await settle();
  assert.equal(state.disk, "# title\n");
  unload();
});

test("disabled formatting, exclusions, preview and focus outside the editor still allow saving", async () => {
  for (const reason of ["disabled", "excluded", "size", "preview", "focus"]) {
    const { plugin, file, state, keydown, unload } = await setup();
    if (reason === "disabled") plugin.settings.formatOnSave = false;
    if (reason === "excluded") plugin.settings.excludedPaths = "*.md";
    if (reason === "size") file.stat.size = 2 * 1024 * 1024;
    if (reason === "preview") state.mode = "preview";
    if (reason === "focus") state.focused = false;
    assert.equal(keydown().defaultPrevented, false);
    await settle();
    assert.equal(state.disk, "#  title\n", reason);
    assert.equal(state.saves.length, 1, reason);
    unload();
  }
});

test("invalid formatting options leave the normal save intact", async () => {
  const { plugin, state, keydown, unload } = await setup();
  plugin.settings.customOptions = "{";
  keydown();
  await settle();
  assert.equal(state.disk, "#  title\n");
  assert.equal(state.saves.length, 1);
  assert.equal(state.errors.length, 1);
  unload();
});

test("input typed while configuration loads is not overwritten or retried", async () => {
  const { plugin, vault, state, keydown, unload } = await setup();
  plugin.settings.configPath = ".prettierrc.json";
  let resolve!: (value: string) => void;
  vault.adapter.read = () => new Promise<string>((done) => (resolve = done));
  keydown();
  state.buffer += "new input";
  resolve("{}");
  await settle();
  assert.equal(state.buffer, "#  title\nnew input");
  assert.equal(state.saves.length, 1);
  unload();
});

test("pop-out shortcuts format only the editor in that window and are removed on unload", async () => {
  const { workspace, view, state, keydown, unload } = await setup(true);
  const popout = new TestDocument();
  view.containerEl.ownerDocument = popout;
  workspace.emit("window-open", {}, { document: popout });
  keydown();
  await settle();
  assert.equal(state.buffer, "#  title\n");
  keydown({}, popout);
  await settle();
  assert.equal(state.disk, "# title\n");
  unload();
  state.buffer = "#  after unload\n";
  keydown({}, popout);
  await settle();
  assert.equal(state.disk, "#  after unload\n");
});

test("the manual format command remains available when shortcut formatting is off", async () => {
  const { plugin, state, commands, editor, file, unload } = await setup();
  plugin.settings.formatOnSave = false;
  await commands.get("format-current-note")!.editorCallback!(
    editor as unknown as Editor,
    { file } as never,
  );
  assert.equal(state.buffer, "# title\n");
  unload();
});
