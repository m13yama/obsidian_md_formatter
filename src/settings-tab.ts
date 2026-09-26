import { Notice, PluginSettingTab, Setting, type App } from "obsidian";
import type MarkdownFormatterPlugin from "./main";
import {
  integer,
  parseOptions,
  validateConfigPath,
  type FormatterSettings,
} from "./settings";

export class FormatterSettingTab extends PluginSettingTab {
  constructor(
    app: App,
    private plugin: MarkdownFormatterPlugin,
  ) {
    super(app, plugin);
  }

  display(): void {
    const { containerEl } = this;
    const settings = this.plugin.settings;
    containerEl.empty();
    containerEl.addClass("prettier-md-settings");
    containerEl.createEl("p", {
      text: "Ctrl+S（MacはCmd+S）で保存するときにPrettierで整形します。自動保存では整形しません。",
    });

    const toggle = (
      key: keyof FormatterSettings,
      name: string,
      description: string,
    ) => {
      new Setting(containerEl)
        .setName(name)
        .setDesc(description)
        .addToggle((control) => {
          control.setValue(settings[key] as boolean).onChange(async (value) => {
            Object.assign(settings, { [key]: value });
            await this.plugin.saveSettings();
          });
        });
    };
    const number = (
      key: "maxFileSizeKb" | "printWidth" | "tabWidth",
      name: string,
      description: string,
      min: number,
      max: number,
    ) => {
      new Setting(containerEl)
        .setName(name)
        .setDesc(description)
        .addText((control) => {
          control.inputEl.type = "number";
          control.inputEl.min = String(min);
          control.inputEl.max = String(max);
          control.setValue(String(settings[key]));
          control.inputEl.addEventListener("change", () => {
            const value = Number(control.getValue());
            if (!integer(value, min, max)) {
              new Notice(`${min}〜${max}の整数を指定してください。`);
              control.setValue(String(settings[key]));
              return;
            }
            settings[key] = value;
            void this.plugin.saveSettings();
          });
        });
    };

    toggle(
      "formatOnSave",
      "Ctrl/Cmd+Sでフォーマット",
      "ONにすると、Ctrl+S（MacはCmd+S）で現在のノートを整形して保存します。",
    );
    number(
      "maxFileSizeKb",
      "ファイルサイズの上限 (KB)",
      "上限を超えるノートは整形しません。",
      1,
      10240,
    );

    containerEl.createEl("h3", { text: "整形オプション" });
    number(
      "printWidth",
      "折り返し幅",
      "PrettierのprintWidth。厳密な最大文字数ではありません。",
      1,
      1000,
    );
    number("tabWidth", "インデント幅", "PrettierのtabWidth。", 1, 16);
    toggle(
      "useTabs",
      "タブでインデント",
      "PrettierのuseTabs。Markdownの構造によってはスペースが使われます。",
    );
    new Setting(containerEl).setName("本文の改行").addDropdown((control) => {
      control
        .addOptions({
          preserve: "元の改行を維持",
          always: "指定幅で折り返す",
          never: "段落内の改行を除去",
        })
        .setValue(settings.proseWrap)
        .onChange(async (value) => {
          settings.proseWrap = value as FormatterSettings["proseWrap"];
          await this.plugin.saveSettings();
        });
    });
    toggle(
      "formatCodeBlocks",
      "コードブロックも整形",
      "JavaScript、TypeScript、JSON、YAML、HTML、CSSなどに対応します。",
    );
    toggle(
      "preserveFrontmatter",
      "プロパティ (YAML) を保持",
      "先頭のYAMLフロントマターをそのまま保持します。",
    );
    toggle(
      "preserveObsidianSyntax",
      "Obsidian記法を保護",
      "コールアウト全体・Wikiリンク・埋め込み・ハイライト・コメント・数式・テンプレートを保持します。",
    );
    new Setting(containerEl)
      .setName("除外パス")
      .setDesc(
        "1行に1パターン。例: Templates/**、**/draft-*.md。Vaultからの相対パスで指定します。",
      )
      .addTextArea((control) => {
        control
          .setValue(settings.excludedPaths)
          .setPlaceholder("Templates/**\n**/draft-*.md")
          .onChange(async (value) => {
            settings.excludedPaths = value;
            await this.plugin.saveSettings();
          });
        control.inputEl.rows = 4;
      });

    containerEl.createEl("h3", { text: "カスタム設定" });
    containerEl.createEl("p", {
      text: "優先順位: 基本設定 → カスタムJSON → 設定ファイル → ファイル別overrides。詳細はREADMEを参照してください。",
    });
    let draft = settings.customOptions;
    const custom = new Setting(containerEl)
      .setName("Prettierオプション (JSON)")
      .setDesc('例: { "printWidth": 100, "singleQuote": true, "semi": false }');
    custom.addTextArea((control) => {
      control.setValue(draft).onChange((value) => {
        draft = value;
      });
      control.inputEl.rows = 7;
      control.inputEl.spellcheck = false;
      control.inputEl.setAttribute("aria-label", "Prettierオプション JSON");
    });
    const errorEl = containerEl.createEl("p", {
      cls: "prettier-md-error",
      attr: { role: "status" },
    });
    new Setting(containerEl).addButton((button) =>
      button
        .setButtonText("JSONを検証して保存")
        .setCta()
        .onClick(async () => {
          try {
            parseOptions(draft);
            settings.customOptions = draft.trim() || "{}";
            await this.plugin.saveSettings();
            errorEl.setText("");
            new Notice("カスタム設定を保存しました。");
          } catch (error) {
            errorEl.setText(
              error instanceof Error ? error.message : String(error),
            );
          }
        }),
    );
    new Setting(containerEl)
      .setName("Vault内の設定ファイル")
      .setDesc(
        "任意。.prettierrc.jsonなどの相対パス。空欄で無効。JSONのみ対応し、整形のたびに読み込みます。",
      )
      .addText((control) => {
        control
          .setValue(settings.configPath)
          .setPlaceholder(".prettierrc.json");
        control.inputEl.addEventListener("change", () => {
          try {
            settings.configPath = validateConfigPath(control.getValue());
            void this.plugin.saveSettings();
          } catch (error) {
            new Notice(error instanceof Error ? error.message : String(error));
            control.setValue(settings.configPath);
          }
        });
      });
  }
}
