import assert from "node:assert/strict";
import { test } from "node:test";
import {
  SaveFormatter,
  type FormatTarget,
  type FormatterHost,
} from "../src/save-formatter";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function setup() {
  const file = { path: "note.md" };
  const state = {
    buffer: "#  title\n",
    enabled: true,
    eligible: true,
    revision: 0,
    calls: 0,
    applies: 0,
    errors: [] as unknown[],
  };
  const editor = { getValue: () => state.buffer };
  let editors: FormatTarget[] = [editor];
  const host: FormatterHost<typeof file> = {
    enabled: () => state.enabled,
    revision: () => state.revision,
    eligible: () => state.eligible,
    editors: () => editors,
    format: async (source) => {
      state.calls++;
      return source.replace("#  ", "# ");
    },
    apply: (_editor, _before, after) => {
      state.applies++;
      state.buffer = after;
    },
    report: (error) => {
      state.errors.push(error);
    },
  };
  const formatter = new SaveFormatter(host);
  return {
    file,
    state,
    host,
    formatter,
    close: () => {
      editors = [];
    },
    open: () => {
      editors = [editor];
    },
  };
}

test("formats current input and avoids edits when already formatted", async () => {
  const { file, state, formatter } = setup();
  assert.equal(await formatter.run(file), "formatted");
  assert.equal(state.applies, 1);
  assert.equal(await formatter.run(file), "unchanged");
  assert.equal(state.applies, 1);
  assert.equal(state.calls, 2);
  formatter.dispose();
});

test("formats the latest unsaved editor input", async () => {
  const { file, state, formatter } = setup();
  state.buffer += "new input";
  assert.equal(await formatter.run(file), "formatted");
  assert.equal(state.buffer, "# title\nnew input");
  assert.equal(state.calls, 1);
  assert.equal(state.applies, 1);
});

test("rechecks formatting options on each explicit request", async () => {
  const { file, state, host, formatter } = setup();
  assert.equal(await formatter.run(file), "formatted");
  host.format = async () => "# title\r\n";
  assert.equal(await formatter.run(file), "formatted");
  assert.equal(state.buffer, "# title\r\n");
});

test("discards results when input, settings, closure, eligibility or unloading changes", async () => {
  for (const change of [
    "input",
    "settings",
    "close",
    "unload",
    "disabled",
    "ineligible",
  ] as const) {
    const fixture = setup();
    const { file, state, host, formatter } = fixture;
    const pending = deferred<string>();
    const started = deferred<void>();
    host.format = () => {
      started.resolve();
      return pending.promise;
    };
    const task = formatter.run(file);
    await started.promise;
    if (change === "input") state.buffer += "new input";
    if (change === "settings") state.revision++;
    if (change === "close") fixture.close();
    if (change === "unload") formatter.dispose();
    if (change === "disabled") state.enabled = false;
    if (change === "ineligible") state.eligible = false;
    pending.resolve("# title\n");
    assert.equal(await task, "stale", change);
    assert.equal(state.applies, 0, change);
    formatter.dispose();
  }
});

test("does not format closed notes", async () => {
  const { file, state, formatter, close } = setup();
  close();
  assert.equal(await formatter.run(file), "skipped");
  assert.equal(state.calls, 0);
});

test("does not overwrite conflicting editor panes", async () => {
  const { file, state, host, formatter } = setup();
  host.editors = () => [
    { getValue: () => state.buffer },
    { getValue: () => "other input" },
  ];
  assert.equal(await formatter.run(file), "stale");
  assert.equal(state.calls, 0);
  assert.equal(state.applies, 0);
});

test("manual command works when shortcut formatting is disabled", async () => {
  const { file, state, formatter } = setup();
  state.enabled = false;
  assert.equal(await formatter.run(file), "skipped");
  assert.equal(await formatter.run(file, true), "formatted");
  state.eligible = false;
  assert.equal(await formatter.run(file, true), "skipped");
});

test("formatter errors leave the original content intact", async () => {
  const { file, state, host, formatter } = setup();
  host.format = async () => {
    throw new Error("Invalid configuration");
  };
  assert.equal(await formatter.run(file), "error");
  assert.equal(state.buffer, "#  title\n");
  assert.equal(state.errors.length, 1);
});

test("ignores requests after unloading", async () => {
  const { file, state, formatter } = setup();
  formatter.dispose();
  assert.equal(await formatter.run(file), "skipped");
  assert.equal(await formatter.run(file, true), "skipped");
  assert.equal(state.calls, 0);
});

test("serializes requests without automatically retrying stale input", async () => {
  const { file, state, host, formatter } = setup();
  const pending = deferred<string>();
  const started = deferred<void>();
  host.format = () => {
    state.calls++;
    if (state.calls === 1) {
      started.resolve();
      return pending.promise;
    }
    return Promise.resolve("# newer\n");
  };
  const first = formatter.run(file);
  await started.promise;
  state.buffer = "#  newer\n";
  assert.equal(await formatter.run(file), "busy");
  pending.resolve("# title\n");
  assert.equal(await first, "stale");
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(state.buffer, "#  newer\n");
  assert.equal(state.calls, 1);
  assert.equal(await formatter.run(file), "formatted");
  assert.equal(state.buffer, "# newer\n");
  assert.equal(state.calls, 2);
  formatter.dispose();
});
