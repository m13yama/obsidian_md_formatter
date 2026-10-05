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

test("wraps bare HTTP(S) URLs while keeping surrounding punctuation outside", async () => {
  const source =
    "See https://example.com/path?x=1&y=2#section, " +
    "http://example.org and (https://example.com/wiki/Title_(detail)).\n";
  const expected =
    "See <https://example.com/path?x=1&y=2#section>, " +
    "<http://example.org> and (<https://example.com/wiki/Title_(detail)>).\n";
  assert.equal(await format(source), expected);
  assert.equal(await format(expected), expected);
  assert.equal(
    await format("HTTPS://example.com\n", { preserveObsidianSyntax: false }),
    "<HTTPS://example.com>\n",
  );
});

test("wraps URLs in headings, lists, quotes and tables with stable layout", async () => {
  const source =
    "# https://example.com\n\n" +
    "- https://example.com\n\n" +
    "> https://example.com\n\n" +
    "| Link | Note |\n| --- | --- |\n| https://example.com | test |\n";
  const expected =
    "# <https://example.com>\n\n" +
    "- <https://example.com>\n\n" +
    "> <https://example.com>\n\n" +
    "| Link                  | Note |\n" +
    "| --------------------- | ---- |\n" +
    "| <https://example.com> | test |\n";
  assert.equal(await format(source), expected);
  for (const proseWrap of ["preserve", "always", "never"] as const) {
    const settings = { proseWrap, printWidth: 25 };
    const once = await format(source, settings);
    assert.equal(await format(once, settings), once);
  }
});

test("keeps existing links, code, HTML and protected Obsidian URLs intact", async () => {
  const sources = [
    "<https://example.com>\n",
    "[Example](https://example.com)\n",
    "[https://example.com](https://example.com)\n",
    "![Image](https://example.com/image.png)\n",
    "[Example][ref]\n\n[ref]: https://example.com\n",
    "`https://example.com`\n",
    "```text\nhttps://example.com\n```\n",
    "    https://example.com\n",
    '<a href="https://example.com">Example</a>\n',
    "<!-- https://example.com -->\n",
    "---\nurl: https://example.com\n---\n",
    "[[https://example.com]] ![[https://example.com/image.png]]\n",
    "==https://example.com== %%https://example.com%%\n",
    '$https://example.com$ <% "https://example.com" %>\n',
    "> [!note] https://example.com\n",
    "www.example.com name@example.com\n",
  ];
  for (const source of sources) {
    assert.equal(await format(source), source, source);
  }
});

test("honors prettier-ignore for bare URLs", async () => {
  const source =
    "<!-- prettier-ignore -->\nhttps://example.com\n\nhttps://example.org\n";
  assert.equal(
    await format(source),
    "<!-- prettier-ignore -->\nhttps://example.com\n\n<https://example.org>\n",
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

test("formats callout prose without merging or wrapping the title", async () => {
  const header = "> [!note]+ Custom  title that must stay on one line\n";
  const source = header + "> one  two three four\n> five six\n";
  const bodies = {
    preserve: "> one two three four\n> five six\n",
    always: "> one two\n> three four\n> five six\n",
    never: "> one two three four five six\n",
  };
  for (const proseWrap of ["preserve", "always", "never"] as const) {
    const settings = { proseWrap, printWidth: 14 };
    const expected = header + bodies[proseWrap];
    assert.equal(await format(source, settings), expected);
    assert.equal(await format(expected, settings), expected);
  }
});

test("formats headings and lists while preserving nested callouts and separators", async () => {
  const source =
    "> [!warning]- 折りたたみ\n> #  Heading\n>\n> *   one\n> *   two\n" +
    ">\n>\n> > [!tip|custom=value]+ Nested  title\n> > Body  text.\n" +
    "\n1. First\n\n   > [!tip] Title\n   > Body  text.\n\n2. Second\n";
  const expected =
    "> [!warning]- 折りたたみ\n> # Heading\n>\n> - one\n> - two\n" +
    ">\n>\n> > [!tip|custom=value]+ Nested  title\n> > Body text.\n" +
    "\n1. First\n\n   > [!tip] Title\n   > Body text.\n\n2. Second\n";
  for (const proseWrap of ["preserve", "always", "never"] as const) {
    const settings = { proseWrap, printWidth: 20 };
    assert.equal(await format(source, settings), expected);
    assert.equal(await format(expected, settings), expected);
  }
});

test("formats standalone callout tables and prose while preserving captions", async () => {
  for (const kind of ["table|caption=bottom", "note"] as const) {
    const header = `> [!${kind}]- Caption  **with spaces**\n`;
    const prose = ">\n> Body  with spacing.\n> Next line.\n";
    const source = header + "> |a|b|\n> |-|-:|\n> |one|2|\n" + prose;
    const bodies = {
      preserve: "> Body with spacing.\n> Next line.\n",
      always: "> Body with\n> spacing. Next\n> line.\n",
      never: "> Body with spacing. Next line.\n",
    };
    for (const proseWrap of ["preserve", "always", "never"] as const) {
      const settings = { proseWrap, printWidth: 15 };
      const expected =
        header +
        "> | a   |   b |\n> | --- | --: |\n> | one |   2 |\n>\n" +
        bodies[proseWrap];
      assert.equal(await format(source, settings), expected);
      assert.equal(await format(expected, settings), expected);
    }
  }
});

test("formats callout URLs and preserves inline Obsidian syntax", async () => {
  const header = "> [!note] ==Title== https://example.org\n";
  const source =
    header +
    "> See https://example.com\n> ==日本語== $x_i + y_i$ [[Note|表示名]] ![[image.png|300]]\n";
  const expected =
    header +
    "> See <https://example.com>\n> ==日本語== $x_i + y_i$ [[Note|表示名]] ![[image.png|300]]\n";
  assert.equal(await format(source), expected);
  assert.equal(await format(expected), expected);
});

test("honors code formatting settings inside nested callouts", async () => {
  const header = "> [!grid]\n> > [!figure|width=300] Code\n";
  const source = header + "> > ```js\n> > const x={a:1}\n> > ```\n";
  assert.equal(await format(source), source);
  const settings = { formatCodeBlocks: true, customOptions: '{"semi":false}' };
  const expected = header + "> > ```js\n> > const x = { a: 1 }\n> > ```\n";
  assert.equal(await format(source, settings), expected);
  assert.equal(await format(expected, settings), expected);
});

test("keeps callout body indentation aligned when formatting enclosing lists", async () => {
  const sources = [
    "> [!note]\n> -   first\n>     next\n>     > [!tip] Nested\n>     > body  text\n>     > next line\n",
    "> [!note]\n> - > [!tip] Nested\n>   > body  text\n>   > next line\n",
    "- > [!tip] Nested\n  > body  text\n  > next line\n",
  ];
  const expected = [
    "> [!note]\n> - first next\n>   > [!tip] Nested\n>   > body text next line\n",
    "> [!note]\n> - > [!tip] Nested\n>   > body text next line\n",
    "- > [!tip] Nested\n  > body text next line\n",
  ];
  const settings = { proseWrap: "never" as const };
  for (const [index, source] of sources.entries()) {
    assert.equal(await format(source, settings), expected[index]);
    assert.equal(await format(expected[index]!, settings), expected[index]);
  }
});

test("preserves quoted multiline extensions between formatted paragraphs", async () => {
  for (const block of [
    "$$\n> x  +  y\n> $$",
    "%%\n> private  **text**\n> %%",
    '<%*\n> const t = "[[x]]";\n> tR += t;\n> %>',
  ]) {
    const source = `> [!note]\n> Before  text\n> ${block}\n> After  text\n`;
    const expected = `> [!note]\n> Before text\n> ${block}\n> After text\n`;
    for (const proseWrap of ["preserve", "always", "never"] as const) {
      const settings = { proseWrap, printWidth: 20 };
      assert.equal(await format(source, settings), expected);
      assert.equal(await format(expected, settings), expected);
    }
  }
});

test("moves protected multiline content with its enclosing list and callout", async () => {
  const source =
    "> [!note]\n> -   first\n>     > [!tip]\n>     > $$\n>     > x + y\n>     > $$\n";
  const expected =
    "> [!note]\n> - first\n>   > [!tip]\n>   > $$\n>   > x + y\n>   > $$\n";
  assert.equal(await format(source), expected);
  assert.equal(await format(expected), expected);
});

test("keeps CRLF when wrapping callout prose onto new quoted lines", async () => {
  const source = "> [!note] Long  title\r\n> one two three four five six\r\n";
  const expected =
    "> [!note] Long  title\r\n> one two\r\n> three four\r\n> five six\r\n";
  const settings = {
    proseWrap: "always" as const,
    printWidth: 14,
    customOptions: '{"endOfLine":"crlf"}',
  };
  assert.equal(await format(source, settings), expected);
  assert.equal(await format(expected, settings), expected);
});

test("honors prettier-ignore for prose and enclosing callouts", async () => {
  const header = "> [!note] Title\n";
  const ignored = "> <!-- prettier-ignore -->\n> one  two\n> three four\n";
  const source = header + ignored + ">\n> five  six\n> seven eight\n";
  const settings = { proseWrap: "never" as const };
  const expected = header + ignored + ">\n> five six seven eight\n";
  assert.equal(await format(source, settings), expected);
  assert.equal(await format(expected, settings), expected);
  const ignoredCallout = "<!-- prettier-ignore -->\n" + source;
  assert.equal(await format(ignoredCallout, settings), ignoredCallout);
});

test("formats captionless and nested tables in a Figures and Tables grid", async () => {
  const header = "> [!grid|cols=2 lgap=16 vgap=24]\n";
  const image =
    ">\n> > [!figure|span=2] Apparatus\n> > ![[apparatus.png|300]]\n>\n";
  const caption = "> > [!table|caption=bottom] Measurement  conditions\n";
  const source =
    header +
    "> |Item|Value|\n> |---|---:|\n> |日本語|100|\n" +
    image +
    caption +
    "> > |a|b|\n> > |-|-|\n> > |1|2|\n\n#  Outside\n";
  const expected =
    header +
    "> | Item   | Value |\n> | ------ | ----: |\n> | 日本語 |   100 |\n" +
    image +
    caption +
    "> > | a   | b   |\n> > | --- | --- |\n> > | 1   | 2   |\n\n# Outside\n";
  for (const proseWrap of ["preserve", "always", "never"] as const) {
    const settings = { proseWrap, printWidth: 20 };
    assert.equal(await format(source, settings), expected);
    assert.equal(await format(expected, settings), expected);
  }
});

test("aligns protected Japanese text and URLs inside grid tables", async () => {
  const source =
    "> [!grid]\n> > [!table] Results\n" +
    "> > |名前|値|\n> > |---|---:|\n" +
    "> > |==日本語==|100|\n> > |$日本語$|9|\n";
  const expected =
    "> [!grid]\n> > [!table] Results\n" +
    "> > | 名前       |  値 |\n> > | ---------- | --: |\n" +
    "> > | ==日本語== | 100 |\n> > | $日本語$   |   9 |\n";
  assert.equal(await format(source), expected);
  assert.equal(await format(expected), expected);

  const table =
    "| Link | Note |\n| --- | --- |\n" +
    "| https://example.com | [[Note\\|Alias]] |\n";
  const quote = (text: string) => text.trimEnd().replace(/^/gm, "> > ") + "\n";
  const header = "> [!grid]\n> > [!table]\n";
  // Callout cells use the same URL conversion and column widths as ordinary tables.
  const expectedLinks = header + quote(await format(table));
  assert.equal(await format(header + quote(table)), expectedLinks);
  assert.equal(await format(expectedLinks), expectedLinks);
});

test("preserves quotation prefixes, list indentation and CRLF within callouts", async () => {
  const source =
    "1. First\n\n   > [!grid]\r\n   >>[!table]\r\n" +
    "   >>a|b\r\n   > > -|-\r\n   >> 1|2\r\n\n2. Second\n";
  const expected =
    "1. First\n\n   > [!grid]\r\n   >>[!table]\r\n" +
    "   >>| a   | b   |\r\n   > > | --- | --- |\r\n   >> | 1   | 2   |\r\n\n2. Second\n";
  assert.equal(await format(source), expected);
  assert.equal(await format(expected), expected);
});

test("keeps table examples in fenced code and protected blocks unchanged", async () => {
  const table = "> |a|b|\n> |-|-|\n> |1|2|\n";
  for (const [open, close] of [
    ["```markdown", "```"],
    ["~~~text", "~~~"],
    ["%%", "%%"],
    ["<%*", "%>"],
    ["$$", "$$"],
    ["<!--", "-->"],
  ]) {
    const source = `> [!grid]\n> ${open}\n${table}> ${close}\n`;
    assert.equal(await format(source), source);
  }
  const example = "```markdown\n> [!table]\n" + table + "```\n";
  assert.equal(await format(example), example);
});

test("honors prettier-ignore on tables, nested callouts and entire grids", async () => {
  const table = "> |a|b|\n> |-|-|\n> |1|2|\n";
  const sources = [
    "<!-- prettier-ignore -->\n> [!grid]\n" + table,
    "> [!grid]\n> <!-- prettier-ignore -->\n" + table,
    "> [!grid]\n> <!-- prettier-ignore -->\n> > [!table]\n" +
      table.replace(/^> /gm, "> > "),
    "> [!grid]\n> <!-- prettier-ignore-start -->\n>\n" +
      table +
      ">\n> <!-- prettier-ignore-end -->\n",
  ];
  for (const source of sources) {
    assert.equal(await format(source), source);
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
