import assert from "node:assert/strict";
import { test } from "node:test";
import { formatMarkdown } from "../src/formatter";
import {
  DEFAULT_SETTINGS,
  resolveOptions,
  type FormatterSettings,
} from "../src/settings";

async function format(
  source: string,
  changes: Partial<FormatterSettings> = {},
) {
  const settings = { ...DEFAULT_SETTINGS, ...changes };
  return formatMarkdown(source, settings, resolveOptions(settings, "note.md"));
}

test("formats headings, lists, and tables with real Prettier", async () => {
  assert.equal(
    await format("#  Title\n\n*   one\n*   two\n"),
    "# Title\n\n- one\n- two\n",
  );
  assert.equal(
    await format("|a|b|\n|-|-|\n|1|2|"),
    "| a   | b   |\n| --- | --- |\n| 1   | 2   |\n",
  );
});

test("aligns mixed Japanese, fullwidth Latin, ASCII and halfwidth kana table cells", async () => {
  const source =
    "|項目|左寄せ|中央寄せ|右寄せ|\n|---|:---|:---:|---:|\n|日本語|ＡＢＣ|かな|１００|\n|abc|123|ｶﾅ|100|\n|AあB|Ｚ9|漢字A|9|\n";
  const expected =
    "| 項目   | 左寄せ | 中央寄せ | 右寄せ |\n" +
    "| ------ | :----- | :------: | -----: |\n" +
    "| 日本語 | ＡＢＣ |   かな   | １００ |\n" +
    "| abc    | 123    |    ｶﾅ    |    100 |\n" +
    "| AあB   | Ｚ9    |  漢字A   |      9 |\n";
  assert.equal(await format(source), expected);
  assert.equal(await format(expected), expected);
});

test("counts protected Japanese table text as two columns per fullwidth character", async () => {
  const source =
    "|名前|値|\n|---|---:|\n|==日本語==|100|\n|%%日本語%%|80|\n|$日本語$|9|\n|Apple|1|\n";
  const expected =
    "| 名前       |  値 |\n" +
    "| ---------- | --: |\n" +
    "| ==日本語== | 100 |\n" +
    "| %%日本語%% |  80 |\n" +
    "| $日本語$   |   9 |\n" +
    "| Apple      |   1 |\n";
  assert.equal(await format(source), expected);
  assert.equal(await format(expected), expected);
});

test("keeps full table widths for protected content longer than 120 characters", async () => {
  const cell = `==${"あ".repeat(140)}==`;
  const expected =
    `| 名前${" ".repeat(281)}| 値  |\n` +
    `| ${"-".repeat(284)} | --- |\n` +
    `| ${cell} | 100 |\n`;
  assert.equal(await format(`|名前|値|\n|---|---|\n|${cell}|100|\n`), expected);
  assert.equal(await format(expected), expected);
});

test("does not widen short protected table cells when many tokens precede them", async () => {
  const prefix = "$x$ ".repeat(150).trimEnd() + "\n\n";
  const table = "| a   | b   |\n| --- | --- |\n| $x$ | $y$ |\n";
  assert.equal(await format(prefix + table), prefix + table);
});

test("preserves private-use characters already present in Japanese tables", async () => {
  const source = "|名前|値|\n|---|---|\n|\ue000|1|\n|==日本語==|2|\n";
  const expected =
    "| 名前       | 値  |\n" +
    "| ---------- | --- |\n" +
    "| \ue000          | 1   |\n" +
    "| ==日本語== | 2   |\n";
  assert.equal(await format(source), expected);
  assert.equal(await format(expected), expected);
});

test("keeps Japanese line breaks by default and allows custom wrapping", async () => {
  assert.equal(
    await format("日本語の文章です。\n次の行を保持します。\n"),
    "日本語の文章です。\n次の行を保持します。\n",
  );
  assert.equal(
    await format("one two\nthree four\n", { proseWrap: "never" }),
    "one two three four\n",
  );
  assert.equal(
    await format("one two three four\n", {
      customOptions: '{"proseWrap":"always","printWidth":8}',
    }),
    "one two\nthree\nfour\n",
  );
});

test("preserves properties including BOM and quoted Wiki links", async () => {
  const yaml = '\uFEFF---\r\ntags: [a,b]\r\nalias: "[[My note]]"\r\n---\r\n';
  assert.equal(await format(yaml + "#  Title\n"), yaml + "# Title\n");
  assert.equal(await format("---\n---\n#  Title\n"), "---\n---\n# Title\n");
  assert.match(
    await format("---\ntags: [a,b]\n---\n", {
      preserveFrontmatter: false,
      formatCodeBlocks: true,
    }),
    /tags: \[a, b\]/,
  );
});

test("preserves whole callouts under all wrapping modes, including nesting", async () => {
  const sources = [
    "> [!note]+ Custom title\n> Body  **with spaces**.\n>\n> -  item\n",
    "> [!warning]- 折りたたみ\n> 内容\n> > [!tip] Nested\n> > body\n",
    "1. First\n\n   > [!tip] Title\n   > body\n\n2. Second\n",
  ];
  for (const source of sources) {
    for (const proseWrap of ["preserve", "always", "never"] as const) {
      assert.equal(await format(source, { proseWrap, printWidth: 20 }), source);
    }
  }
});

test("preserves Wiki links, embeds, highlights, comments, math and templates", async () => {
  const extensions = [
    "[[My Note#Heading|表示名]]",
    "![[image.png|300]]",
    "[[My Note#^block-id]]",
    "==a highlighted phrase==",
    "%%hidden **markdown**%%",
    "$x_i + y_i$",
    '<% tp.date.now("YYYY-MM-DD") %>',
  ];
  const result = await format(extensions.join(" "), {
    proseWrap: "always",
    printWidth: 20,
  });
  for (const extension of extensions)
    assert.ok(result.includes(extension), extension);
});

test("keeps display math on separate lines even without surrounding blank lines", async () => {
  const math = "$$\n\\begin{align}\nx &= y \\\\\nz &= t\n\\end{align}\n$$";
  const output = await format(`Before\n${math}\nAfter\n`, {
    proseWrap: "never",
  });
  assert.ok(output.includes(`\n${math}\n`));
});

test("preserves multiline comments and templates verbatim", async () => {
  for (const block of [
    "%%\nprivate  **text**\n%%",
    '<%*\nconst t = "[[x]]";\ntR += t;\n%>',
  ]) {
    assert.ok((await format(block + "\n\n#  Title\n")).includes(block));
  }
});

test("does not interpret Obsidian extensions inside inline or fenced code", async () => {
  const source =
    "`` `literal` ==text== %%comment%% ``\n\n```text\n[[note]] ==literal== %%comment%%\n```\n";
  assert.equal(await format(source), source);
  const unclosed = "```text\n==literal==\n> [!note] literal\n";
  assert.ok(
    (await format(unclosed)).includes("==literal==\n> [!note] literal"),
  );
});

test("formats supported embedded languages only when enabled", async () => {
  const source = "```js\nconst x={a:1}\n```\n";
  assert.equal(await format(source), source);
  assert.equal(
    await format(source, {
      formatCodeBlocks: true,
      customOptions: '{"semi":false}',
    }),
    "```js\nconst x = { a: 1 }\n```\n",
  );
  assert.match(
    await format("```ts\nconst x:number=1\n```\n", { formatCodeBlocks: true }),
    /const x: number = 1;/,
  );
  assert.equal(
    await format("```dataview\nTABLE file.name\nFROM #tag\n```\n", {
      formatCodeBlocks: true,
    }),
    "```dataview\nTABLE file.name\nFROM #tag\n```\n",
  );
});

test("supports prettier-ignore comments", async () => {
  const source = "<!-- prettier-ignore -->\n|a|b|\n|-|-|\n|1|2|\n";
  assert.equal(await format(source), source);
});

test("repeated formatting is stable with extensions, tables and code", async () => {
  const source =
    "#  Title\n\n[[My Note|Alias]] ==highlight== $x+y$\n\n| Link | Text |\n| --- | --- |\n| [[Note\\|Alias]] | hi |\n\n> [!note]+ Title\n> body\n\n$$\nx+y\n$$\n\n```js\nlet a=1\n```\n";
  for (const proseWrap of ["preserve", "always", "never"] as const) {
    const settings = { proseWrap, formatCodeBlocks: true, printWidth: 25 };
    const once = await format(source, settings);
    assert.equal(await format(once, settings), once);
  }
});
