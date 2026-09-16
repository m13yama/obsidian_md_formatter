import { MarkdownView, Notice, Plugin, TFile, type Editor } from "obsidian";
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
  private pendingComposition = new Set<TFile>();
  private lastError = "";
  private lastErrorAt = 0;

  async onload(): Promise<void> {
    this.settings = loadSettings(await this.loadData());
    this.formatter = new SaveFormatter<TFile>({
      enabled: () => this.settings.formatOnSave,
      delay: () => this.settings.debounceMs,
      revision: () => this.revision,
      eligible: (file, manual) => this.eligible(file, manual),
      read: (file) => this.app.vault.read(file),
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
      writeIfUnchanged: async (file, before, after, valid) => {
        let written = false;
        await this.app.vault.process(file, (current) => {
          if (!valid() || this.editors(file).length || current !== before)
            return current;
          written = true;
          return after;
        });
        return written;
      },
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
      name: "保存時のフォーマットを切り替え",
      callback: async () => {
        this.settings.formatOnSave = !this.settings.formatOnSave;
        await this.saveSettings();
        new Notice(
          `保存時フォーマット: ${this.settings.formatOnSave ? "ON" : "OFF"}`,
        );
      },
    });

    this.registerEvent(
      this.app.vault.on("modify", (file) => {
        if (!(file instanceof TFile)) return;
        if (this.composing.size) this.pendingComposition.add(file);
        else this.formatter.schedule(file);
      }),
    );
    this.registerEvent(
      this.app.vault.on("delete", (file) => {
        if (file instanceof TFile) {
          this.formatter.cancel(file);
          this.pendingComposition.delete(file);
        }
      }),
    );
    this.registerEvent(
      this.app.vault.on("rename", (file) => {
        this.revision++;
        if (file instanceof TFile) this.formatter.cancel(file);
      }),
    );
    const watchComposition = (doc: Document) => {
      this.registerDomEvent(doc, "compositionstart", () => {
        this.composing.add(doc);
      });
      const finish = () => {
        this.composing.delete(doc);
        if (this.composing.size) return;
        for (const file of this.pendingComposition)
          this.formatter.schedule(file);
        this.pendingComposition.clear();
      };
      this.registerDomEvent(doc, "compositionend", finish);
      if (doc.defaultView)
        this.registerDomEvent(doc.defaultView, "blur", finish);
    };
    const documents = new Set<Document>([document]);
    this.app.workspace.iterateAllLeaves((leaf) =>
      documents.add(leaf.view.containerEl.ownerDocument),
    );
    for (const doc of documents) watchComposition(doc);
    this.registerEvent(
      this.app.workspace.on("window-open", (_workspaceWindow, win) =>
        watchComposition(win.document),
      ),
    );
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

  private eligible(file: TFile, manual: boolean): boolean {
    return (
      file.extension.toLowerCase() === "md" &&
      this.app.vault.getAbstractFileByPath(file.path) === file &&
      !isExcluded(file.path, this.settings.excludedPaths) &&
      file.stat.size <= this.settings.maxFileSizeKb * 1024 &&
      !this.composing.size &&
      (manual ||
        this.settings.formatClosedFiles ||
        this.editors(file).length > 0)
    );
  }

  async saveSettings(): Promise<void> {
    this.revision++;
    this.formatter.reset();
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
    this.pendingComposition.clear();
    this.composing.clear();
  }
}
