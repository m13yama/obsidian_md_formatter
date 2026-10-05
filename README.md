# Prettier Markdown Formatter

An Obsidian plugin that formats Markdown notes with Prettier when you save with Ctrl+S (Cmd+S on macOS). It does not format on autosave. It supports a settings interface, custom JSON options, and configuration files within your vault.

The plugin's settings and commands are currently displayed in Japanese. This guide uses English translations of their labels.

## Installation

Download `prettier-md-formatter-0.4.0-beta.5.zip` from the [0.4.0 Beta 5 release page](https://github.com/m13yama/obsidian_md_formatter/releases/tag/0.4.0), extract it, and copy the `prettier-md-formatter` folder into your vault's `.obsidian/plugins/` directory.

Beta versions are distributed as GitHub pre-releases. Installation through Obsidian's community plugin directory is not yet supported.

```text
<Vault>/.obsidian/plugins/prettier-md-formatter/
├── main.js
├── manifest.json
└── styles.css
```

Restart or reload Obsidian, then enable **Prettier Markdown Formatter** under Settings → Community plugins. Obsidian 1.5.0 or later is required.

To build from source, use Node.js 22 or later:

```sh
npm ci
npm run build
```

The build generates `main.js` and the distribution folder `dist/prettier-md-formatter/`. Prettier and the supported parsers are bundled, so neither Node.js nor a network connection is required to use the plugin. The plugin is built to support mobile devices, but it has not yet been tested on them.

After building from source, copy the generated `dist/prettier-md-formatter` folder into your vault's `.obsidian/plugins/` directory.

## Ctrl/Cmd+S behavior

Formatting with Ctrl/Cmd+S is enabled by default. While editing a note, press Ctrl+S (Cmd+S on macOS) to perform the normal save, format the current text, and save the formatted result. This also works for notes that have already been saved and have no pending changes. Obsidian autosaves, synchronization, and changes from external editors or other plugins do not trigger formatting.

- Formatting applies to Markdown notes in Source mode or Live Preview when the editor has focus. Pop-out windows are also supported.
- Changes are applied through the Editor API, preserving the cursor, multiple selections, and scroll position.
- If the text or settings change during formatting, the result is discarded. Press Ctrl/Cmd+S again to format the latest content.
- Formatting is skipped during IME composition, such as when entering Japanese text. Finish composing, then press Ctrl/Cmd+S.
- If the configuration file is missing or the JSON is invalid, the plugin displays a notice and skips formatting. Normal saving still works.

Use the "Toggle formatting with Ctrl/Cmd+S" command to enable or disable this behavior. The existing enabled/disabled setting is retained when upgrading. The "Format current note" command remains available even when formatting with Ctrl/Cmd+S is disabled. You can assign shortcuts to these commands in Obsidian's hotkey settings. Exclusions and file size limits also apply to manual formatting.

## Customization

| Setting                 | Default                       | Behavior                                         |
| ----------------------- | ----------------------------- | ------------------------------------------------ |
| Format with Ctrl/Cmd+S  | ON                            | Format and save the current note with Ctrl/Cmd+S |
| Maximum file size       | 1024 KB                       | Skip notes larger than this limit                |
| Print width             | 80                            | Prettier's `printWidth`                          |
| Indentation width       | 2                             | Prettier's `tabWidth`                            |
| Indent with tabs        | OFF                           | Prettier's `useTabs`                             |
| Prose wrapping          | Preserve existing line breaks | `preserve` / `always` / `never`                  |
| Format code blocks      | OFF                           | Format embedded code in supported languages      |
| Preserve properties     | ON                            | Keep YAML frontmatter unchanged                  |
| Protect Obsidian syntax | ON                            | Preserve the syntax described below              |

In addition to the wiki links and embeds recognized by Prettier, the plugin preserves callout headers, nesting, and separators, highlights, `%%comments%%`, math, and `<% ... %>` templates. Support for every custom syntax used by third-party plugins is not guaranteed.

Callout body paragraphs, headings, lists, URLs, and Markdown tables are formatted. This includes nested callouts, callouts inside lists, and captionless tables in Figures and Tables `[!grid]` layouts. Titles, captions, options, and folding markers remain on their original header lines. Body text follows the prose wrapping setting, with quotation prefixes included in the print width. Existing blank quotation lines and grid separators are retained. Code blocks follow the "Format code blocks" setting, and elements marked with `<!-- prettier-ignore -->` are left unchanged. Placing that comment before a callout skips its entire contents.

"Format code blocks" supports JavaScript / JSX, TypeScript / TSX, JSON / JSON5 / JSONC, YAML, HTML / Vue, and CSS / SCSS / Less. Blocks without a bundled parser, such as Dataview and Mermaid, retain their contents. To format YAML frontmatter, turn off "Preserve properties" and turn on "Format code blocks."

### Angle brackets around URLs

Bare HTTP / HTTPS URLs in text are enclosed in angle brackets during formatting: `https://example.com` becomes `<https://example.com>`. This also applies to URLs in headings, lists, block quotes, and tables. No additional configuration is required.

This conversion leaves existing links, images, code, HTML attributes, preserved properties, and protected Obsidian syntax intact. Elements excluded with `<!-- prettier-ignore -->` are also skipped.

### Character widths in tables

Table columns and padding are aligned by counting Japanese characters and fullwidth letters and digits as **two columns**, and ASCII characters, halfwidth katakana, and spaces as **one column**. This happens automatically during formatting. Left, center, and right alignment are preserved.

The example below includes `りんご` (Japanese for "apple") and fullwidth letters and digits to demonstrate their widths:

```md
| Item   |  Price |
| ------ | -----: |
| りんご |    100 |
| Apple  |     80 |
| ＡＢＣ | １００ |
```

Protected content, including highlights, `%%comments%%`, and math, retains its original display width. Column widths include the Markdown syntax characters in the source. Visual alignment in the editor also depends on the character widths of the selected font.

### Custom JSON

Enter options in the "Prettier options (JSON)" field in the plugin settings, then click "Validate and save JSON."

```json
{
  "printWidth": 100,
  "proseWrap": "preserve",
  "tabWidth": 4,
  "singleQuote": true,
  "semi": false
}
```

Supported options:

- `printWidth` (1–1000), `tabWidth` (1–16), `useTabs`, `proseWrap`
- `endOfLine`, `embeddedLanguageFormatting`
- `semi`, `singleQuote`, `jsxSingleQuote`, `trailingComma`
- `bracketSpacing`, `bracketSameLine`, `arrowParens`, `quoteProps`
- `htmlWhitespaceSensitivity`, `singleAttributePerLine`, `objectWrap`

Code-specific options apply to code blocks in supported languages. The `parser` is fixed to Markdown. External Prettier plugins, JavaScript configuration files, and arbitrary code execution are not supported. Rules without a Prettier option, such as list markers, follow Prettier's output.

### Configuration files in your vault

Create `.prettierrc.json` at the root of your vault and enter `.prettierrc.json` in the plugin's "Configuration file in vault" setting. The file is read each time formatting runs. Configuration files are not discovered automatically; only the specified JSON file is used.

```json
{
  "printWidth": 100,
  "proseWrap": "preserve",
  "overrides": [
    {
      "files": "Articles/**/*.md",
      "excludeFiles": "Articles/drafts/**",
      "options": {
        "proseWrap": "always",
        "printWidth": 80
      }
    }
  ]
}
```

Options are applied in this order: **basic settings → custom JSON → configuration file → matching overrides**. Later values take precedence. If multiple overrides match, later overrides win. Both `files` and `excludeFiles` accept a string or an array of strings.

### Excluded paths

Enter one pattern per line in the plugin settings:

```text
# Exclude templates and drafts
Templates/**
**/draft-*.md
Archive/
```

Exclusion and override patterns match paths relative to the vault and are case-sensitive. `*` matches any characters except `/`, `**` matches across directory levels, and `?` matches one character other than `/`. `**/` also matches zero directory levels. A trailing `/` includes all contents below that directory. Lines beginning with `#` are comments. Brace expansion, character classes, and negated patterns are not supported. The plugin does not read `.prettierignore` or `.editorconfig`.

You can also place `<!-- prettier-ignore -->` in Markdown to exclude the next element from formatting.

## Development and verification

```sh
npm run dev          # Watch for file changes and rebuild main.js
npm test             # Test Prettier, shortcuts, edit conflicts, settings, and diffs
npm run typecheck
npm run build
npm run format:check
```

Manual checks in Obsidian:

1. Install the plugin in a test vault, type `#  Title` in a note, and confirm that autosave leaves it unchanged.
2. Press Ctrl+S (Cmd+S on macOS) and confirm that the note is formatted to `# Title` and saved. Also check already saved notes and pop-out windows.
3. Continue typing while formatting runs and confirm that no input is lost.
4. Confirm that formatting does not run during Japanese IME composition or on autosave after composition ends, and that pressing Ctrl/Cmd+S afterward formats the note.
5. Check settings changes, exclusions, manual commands, undo, and multiple panes.
6. Disable the plugin or formatting with Ctrl/Cmd+S and confirm that Ctrl/Cmd+S only performs a normal save.

Automated tests, type checks, and distribution builds can be run in this development environment. GUI testing in Obsidian itself has not been performed here.

## References

- [Prettier standalone](https://prettier.io/docs/browser)
- [Prettier options](https://prettier.io/docs/options)
- [Obsidian Vault API](https://docs.obsidian.md/Plugins/Vault)
- [Obsidian Editor API](https://docs.obsidian.md/Plugins/Editor/Editor)
