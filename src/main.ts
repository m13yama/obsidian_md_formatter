import {
  MarkdownView,
  Notice,
  Plugin,
  type TFile,
  type Editor,
} from "obsidian";
import { applyToEditor } from "./editor";
import { formatMarkdown } from "./formatter";
import { SaveFormatter } from "./save-formatter";
import {
  DEFAULT_SETTINGS,
  isExcluded,
  loadSettings,
  resolveOptions,
  validateConfigPath,
  type FormatterSettings,
} from "./settings";
import { FormatterSettingTab } from "./settings-tab";

export default class MarkdownFormatterPlugin extends Plugin {
  settings: FormatterSettings = { ...DEFAULT_SETTINGS };
  private formatter!: SaveFormatter<TFile>;
  private revision = 0;
  private composing = new Set<Document>();
  private lastError = "";
  private lastErrorAt = 0;

  async onload(): Promise<void> {
    this.settings = loadSettings(await this.loadData());
    this.formatter = new SaveFormatter<TFile>({
      enabled: () => this.settings.formatOnSave,
      revision: () => this.revision,
      eligible: (file) => this.eligible(file),
      editors: (file) => this.editors(file),
      format: async (source, file) => {
        if (
          new TextEncoder().encode(source).byteLength >
          this.settings.maxFileSizeKb * 1024
        ) {
          throw new Error("ファイルサイズが整形の上限を超えています。");
        }
        const configPath = validateConfigPath(this.settings.configPath);
        const config = configPath
          ? await this.app.vault.adapter.read(configPath)
          : "{}";
        const options = resolveOptions(this.settings, file.path, config);
        return formatMarkdown(source, this.settings, options);
      },
      apply: (editor, before, after) =>
        applyToEditor(editor as Editor, before, after),
      report: (error, file) => this.report(error, file.path),
    });

    this.addSettingTab(new FormatterSettingTab(this.app, this));
    this.addCommand({
      id: "format-current-note",
      name: "現在のノートをフォーマット",
      editorCallback: async (editor, info) => {
        if (!info.file) return;
        if (!this.editors(info.file).includes(editor)) {
          new Notice(
            "ノートをソースモードまたはライブプレビューで開いて実行してください。",
          );
          return;
        }
        const result = await this.formatter.run(info.file, true);
        const messages = {
          formatted: "ノートをフォーマットしました。",
          unchanged: "すでに整形済みです。",
          skipped:
            "除外設定・サイズ上限・入力状態により整形をスキップしました。",
          stale: "整形中に内容が変わりました。もう一度実行してください。",
          busy: "このノートは整形中です。",
        };
        if (result !== "error") new Notice(messages[result]);
      },
    });
    this.addCommand({
      id: "toggle-format-on-save",
      name: "Ctrl/Cmd+Sでのフォーマットを切り替え",
      callback: async () => {
        this.settings.formatOnSave = !this.settings.formatOnSave;
        await this.saveSettings();
        new Notice(
          `Ctrl/Cmd+Sでのフォーマット: ${this.settings.formatOnSave ? "ON" : "OFF"}`,
        );
      },
    });

    this.registerEvent(
      this.app.vault.on("rename", () => {
        this.revision++;
      }),
    );
    const documents = new Set<Document>();
    const watchDocument = (doc: Document) => {
      if (documents.has(doc)) return;
      documents.add(doc);
      this.registerDomEvent(
        doc,
        "keydown",
        (event) => {
          if (
            !this.settings.formatOnSave ||
            event.key.toLowerCase() !== "s" ||
            (!event.ctrlKey && !event.metaKey) ||
            (event.ctrlKey && event.metaKey) ||
            event.altKey ||
            event.shiftKey ||
            event.repeat ||
            event.isComposing
          )
            return;
          const view = this.app.workspace.getActiveViewOfType(MarkdownView);
          if (
            !view?.file ||
            view.getMode() !== "source" ||
            view.containerEl.ownerDocument !== doc ||
            !view.editor.hasFocus()
          )
            return;
          // Let Obsidian handle the original save shortcut, including errors or skips.
          void this.formatAndSave(view);
        },
        { capture: true },
      );
      this.registerDomEvent(doc, "compositionstart", () => {
        this.composing.add(doc);
      });
      const finish = () => {
        this.composing.delete(doc);
      };
      this.registerDomEvent(doc, "compositionend", finish);
      if (doc.defaultView)
        this.registerDomEvent(doc.defaultView, "blur", finish);
    };
    watchDocument(document);
    this.app.workspace.iterateAllLeaves((leaf) =>
      watchDocument(leaf.view.containerEl.ownerDocument),
    );
    this.registerEvent(
      this.app.workspace.on("window-open", (_workspaceWindow, win) =>
        watchDocument(win.document),
      ),
    );
  }

  private async formatAndSave(view: MarkdownView): Promise<void> {
    const file = view.file;
    if (!file) return;
    const result = await this.formatter.run(file);
    if (
      (result === "formatted" || result === "unchanged") &&
      view.file === file &&
      this.editors(file).includes(view.editor)
    ) {
      try {
        await view.save();
      } catch (error) {
        this.report(error, file.path);
      }
    }
  }

  private editors(file: TFile): Editor[] {
    const editors: Editor[] = [];
    this.app.workspace.iterateAllLeaves((leaf) => {
      const view = leaf.view;
      if (
        view instanceof MarkdownView &&
        view.file === file &&
        view.getMode() === "source" &&
        !editors.includes(view.editor)
      ) {
        editors.push(view.editor);
      }
    });
    return editors;
  }

  private eligible(file: TFile): boolean {
    return (
      file.extension.toLowerCase() === "md" &&
      this.app.vault.getAbstractFileByPath(file.path) === file &&
      !isExcluded(file.path, this.settings.excludedPaths) &&
      file.stat.size <= this.settings.maxFileSizeKb * 1024 &&
      !this.composing.size
    );
  }

  async saveSettings(): Promise<void> {
    this.revision++;
    await this.saveData(this.settings);
  }

  private report(error: unknown, path: string): void {
    const message = error instanceof Error ? error.message : String(error);
    if (message !== this.lastError || Date.now() - this.lastErrorAt > 10000) {
      new Notice(`Prettier: ${path}\n${message}`, 8000);
      this.lastError = message;
      this.lastErrorAt = Date.now();
    }
    console.error("Prettier Markdown Formatter:", path, error);
  }

  onunload(): void {
    this.formatter?.dispose();
    this.composing.clear();
  }
}
