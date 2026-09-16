import assert from "node:assert/strict";
import { test } from "node:test";
import {
  DEFAULT_SETTINGS,
  isExcluded,
  loadSettings,
  matchesPath,
  parseOptions,
  resolveOptions,
  validateConfigPath,
} from "../src/settings";

test("validates stored settings without accepting unknown keys or invalid numeric ranges", () => {
  assert.deepEqual(loadSettings(null), DEFAULT_SETTINGS);
  const settings = loadSettings({
    printWidth: -1,
    tabWidth: 4,
    proseWrap: "invalid",
    formatOnSave: "true",
    unknown: 1,
  });
  assert.equal(settings.printWidth, 80);
  assert.equal(settings.tabWidth, 4);
  assert.equal(settings.proseWrap, "preserve");
  assert.equal(settings.formatOnSave, true);
  assert.ok(!("unknown" in settings));
});

test("rejects invalid JSON, wrong values, parser overrides, and plugin loading", () => {
  for (const json of [
    "{",
    "null",
    "[]",
    '{"printWidth":0}',
    '{"useTabs":"true"}',
    '{"parser":"babel"}',
    '{"plugins":["x"]}',
    '{"__proto__":{}}',
    '{"constructor":true}',
    '{"proseWrap":["never"]}',
  ]) {
    assert.throws(() => parseOptions(json), json);
  }
  assert.equal(parseOptions('{"printWidth":100}').printWidth, 100);
});

test("supports vault-relative glob exclusions", () => {
  for (const path of ["note.md", "a/note.md", "a/b/note.md"])
    assert.ok(matchesPath(path, "**/*.md"));
  assert.ok(matchesPath("Templates/nested/note.md", "Templates/"));
  assert.ok(matchesPath("daily/2026-09-16.md", "daily/????-??-??.md"));
  assert.ok(matchesPath("Notes/[draft].md", "Notes/[draft].md"));
  assert.equal(matchesPath("a/b/note.md", "a/*.md"), false);
  assert.equal(matchesPath("notes.md.bak", "**/*.md"), false);
  assert.equal(matchesPath("Notes/a.md", "notes/**"), false);
  assert.ok(isExcluded("Templates/a.md", "# comment\n\nTemplates/**\n"));
});

test("resolves settings, JSON, config file and matching overrides in order", () => {
  const settings = {
    ...DEFAULT_SETTINGS,
    printWidth: 90,
    customOptions: '{"printWidth":100,"tabWidth":4}',
  };
  const json = JSON.stringify({
    printWidth: 110,
    overrides: [
      {
        files: "Journal/**",
        excludeFiles: "**/skip.md",
        options: { printWidth: 120, proseWrap: "never" },
      },
    ],
  });
  assert.equal(resolveOptions(settings, "a.md", json).printWidth, 110);
  assert.equal(resolveOptions(settings, "a.md", json).tabWidth, 4);
  assert.equal(resolveOptions(settings, "Journal/a.md", json).printWidth, 120);
  assert.equal(
    resolveOptions(settings, "Journal/skip.md", json).printWidth,
    110,
  );
  assert.throws(() =>
    resolveOptions(
      settings,
      "a.md",
      '{"overrides":[{"files":3,"options":{}}]}',
    ),
  );
});

test("limits config files to JSON paths within the vault", () => {
  assert.equal(validateConfigPath(" .prettierrc.json "), ".prettierrc.json");
  assert.equal(
    validateConfigPath("config\\formatter.json"),
    "config/formatter.json",
  );
  for (const path of [
    "../x.json",
    "/x.json",
    "C:/x.json",
    "x/../../x.json",
    "config.js",
  ]) {
    assert.throws(() => validateConfigPath(path));
  }
});
