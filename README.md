# Prettier Markdown Formatter

ObsidianのMarkdownノートを、保存後にPrettierで自動整形するプラグインです。日本語の設定画面、カスタムJSON、Vault内の設定ファイルに対応しています。

## インストール

[0.1.0 Beta 1のリリースページ](https://github.com/m13yama/obsidian_md_formatter/releases/tag/0.1.0)から `prettier-md-formatter-0.1.0-beta.1.zip` をダウンロードし、解凍してできる `prettier-md-formatter` フォルダを、使用するVaultの `.obsidian/plugins/` にコピーします。

ベータ版としてGitHubのPre-releaseで配布しています。Obsidianのコミュニティプラグイン一覧からのインストールにはまだ対応していません。

```text
<Vault>/.obsidian/plugins/prettier-md-formatter/
├── main.js
├── manifest.json
└── styles.css
```

Obsidianを再起動するか再読み込みし、設定 → コミュニティプラグインで **Prettier Markdown Formatter** を有効にしてください。Obsidian 1.5.0以降を対象としています。

ソースからビルドする場合はNode.js 22以降を使います。

```sh
npm ci
npm run build
```

`main.js` と配布用の `dist/prettier-md-formatter/` が生成されます。Prettier本体と対応するパーサーは同梱されるため、利用時のNode.jsやネット接続は不要です。モバイルでも使用できる構成ですが、実機での確認はまだ行っていません。

ソースからビルドした場合は、生成された `dist/prettier-md-formatter` フォルダをVaultの `.obsidian/plugins/` にコピーしてください。

## 保存時の動作

初期状態で保存時フォーマットが有効です。Obsidianの自動保存を含むファイル変更を検知し、最後の保存から700ms後に整形します。Ctrl/Cmd+Sも、実際にファイルが保存された場合に対象となります。未変更のノートを整形するにはコマンドパレットの「現在のノートをフォーマット」を使ってください。

- 初期状態では、ソースモードまたはライブプレビューで開いているMarkdownノートが対象です。
- 「開いていないノートも対象にする」を有効にすると、同期・外部エディタ・他プラグインによる変更も対象です。起動時に全ノートを一括整形する機能ではありません。
- 開いているノートにはEditor APIで差分を適用し、Obsidianの通常の保存処理に引き継ぎます。カーソル・複数選択・スクロール位置を維持します。
- 整形中に本文や設定が変わった場合、その結果は適用せず、次の保存を待ちます。開いていないノートも、書き込み直前に元の内容と一致するか確認します。
- 日本語などのIME変換中は整形を保留します。
- 整形結果による再保存はスキップし、無限ループを防ぎます。
- 設定ファイルが存在しない場合やJSONが不正な場合は通知し、そのノートを変更しません。

「保存時のフォーマットを切り替え」コマンドでON/OFFを変更できます。コマンドにはObsidianのホットキー設定から任意のキーを割り当てられます。手動整形にも除外設定・サイズ上限が適用されます。

## カスタマイズ

| 設定                     | 初期値         | 動作                             |
| ------------------------ | -------------- | -------------------------------- |
| 保存時にフォーマット     | ON             | 保存を検知して整形               |
| 保存後の待機時間         | 700ms          | 連続する保存をまとめる           |
| 開いていないノートも対象 | OFF            | 外部変更も対象にする             |
| ファイルサイズの上限     | 1024KB         | 大きなノートをスキップ           |
| 折り返し幅               | 80             | Prettierの `printWidth`          |
| インデント幅             | 2              | Prettierの `tabWidth`            |
| タブでインデント         | OFF            | Prettierの `useTabs`             |
| 本文の改行               | 元の改行を維持 | `preserve` / `always` / `never`  |
| コードブロックも整形     | OFF            | 対応言語の埋め込みコードを整形   |
| プロパティを保持         | ON             | YAMLフロントマターをそのまま保持 |
| Obsidian記法を保護       | ON             | 下記の固有記法を保持             |

Prettierが認識するWikiリンク・埋め込みに加えて、コールアウト全体、ハイライト、`%%コメント%%`、数式、`<% ... %>` テンプレートを保持します。コールアウト内部は整形しません。任意のサードパーティプラグインの独自記法すべてを保証するものではありません。

「コードブロックも整形」でJavaScript / JSX、TypeScript / TSX、JSON / JSON5 / JSONC、YAML、HTML / Vue、CSS / SCSS / Lessに対応します。DataviewやMermaidなど、同梱パーサーのないコードブロックは内容を保持します。YAMLフロントマターを整形する場合は「プロパティを保持」をOFFにし、「コードブロックも整形」をONにしてください。

### テーブルの文字幅

テーブルは日本語や全角英数字を **2幅**、半角英数字・半角カナ・スペースを **1幅** として、列の幅と余白を揃えます。追加設定は不要で、保存時に適用されます。左寄せ・中央寄せ・右寄せの指定も保持します。

```md
| 名前   |   価格 |
| ------ | -----: |
| りんご |    100 |
| Apple  |     80 |
| ＡＢＣ | １００ |
```

`==日本語==`、`%%コメント%%`、数式などを保護する場合も元の文字幅を保持します。列幅はMarkdownソースの記号も含めて計算します。エディタ上での見た目は表示フォントの字幅にも依存します。

### カスタムJSON

設定画面の「Prettierオプション (JSON)」に入力して「JSONを検証して保存」を押します。

```json
{
  "printWidth": 100,
  "proseWrap": "preserve",
  "tabWidth": 4,
  "singleQuote": true,
  "semi": false
}
```

対応オプション:

- `printWidth` (1〜1000)、`tabWidth` (1〜16)、`useTabs`、`proseWrap`
- `endOfLine`、`embeddedLanguageFormatting`
- `semi`、`singleQuote`、`jsxSingleQuote`、`trailingComma`
- `bracketSpacing`、`bracketSameLine`、`arrowParens`、`quoteProps`
- `htmlWhitespaceSensitivity`、`singleAttributePerLine`、`objectWrap`

コード向けの設定は対応言語のコードブロックに適用されます。`parser` はMarkdownに固定しています。外部Prettierプラグイン、JavaScript設定ファイル、任意コードの実行には対応していません。箇条書きの記号などPrettierにオプションのないルールはPrettierの出力に従います。

### Vault内の設定ファイル

Vaultのルートに `.prettierrc.json` を作り、プラグイン設定の「Vault内の設定ファイル」に `.prettierrc.json` と指定すると、整形のたびに読み込みます。自動探索は行わず、指定したJSONファイルだけを使用します。

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

優先順位は **基本設定 → カスタムJSON → 設定ファイル → 一致するoverrides** です。複数のoverridesが一致する場合は後の設定が優先されます。`files` / `excludeFiles` は文字列または文字列配列を受け付けます。

### 除外パス

設定画面に1行ずつ指定します。

```text
# テンプレートと下書きを除外
Templates/**
**/draft-*.md
Archive/
```

除外設定とoverridesはVaultからの相対パスを対象にし、大文字・小文字を区別します。`*` は `/` 以外、`**` は階層をまたぐ任意の文字列、`?` は `/` 以外の1文字です。`**/` は0階層にも一致します。末尾 `/` は配下すべてを対象にします。`#` で始まる行はコメントです。波括弧展開、文字クラス、否定パターンは未対応です。`.prettierignore` と `.editorconfig` は読み込みません。

Markdown内の `<!-- prettier-ignore -->` で次の要素を整形対象から外すこともできます。

## 開発と確認

```sh
npm run dev          # ファイル変更を監視してmain.jsを更新
npm test             # Prettier実動作・保存競合・設定・編集差分のテスト
npm run typecheck
npm run build
npm run format:check
```

ObsidianのGUI上での確認項目:

1. テストVaultにインストールし、ノートに `#  Title` を入力して自動保存後に `# Title` になることを確認する。
2. 整形待ちの間も入力し、入力した内容が失われないことを確認する。
3. 日本語IME変換中に整形されず、変換確定・保存後に整形されることを確認する。
4. 設定変更、除外パス、手動コマンド、元に戻す操作、複数ペインを確認する。
5. プラグインを無効にした後、保存しても整形されないことを確認する。

自動テスト・型チェック・配布ビルドは実行できますが、この開発環境ではObsidian実機のGUI確認は未実施です。

## 参照

- [Prettier standalone](https://prettier.io/docs/browser)
- [Prettierのオプション](https://prettier.io/docs/options)
- [Obsidian Vault API](https://docs.obsidian.md/Plugins/Vault)
- [Obsidian Editor API](https://docs.obsidian.md/Plugins/Editor/Editor)
