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
    disk: "#  title\n",
    buffer: "#  title\n",
    enabled: true,
    eligible: true,
    revision: 0,
    calls: 0,
    writes: 0,
    applies: 0,
    errors: [] as unknown[],
  };
  const editor = { getValue: () => state.buffer };
  let editors: FormatTarget[] = [editor];
  const host: FormatterHost<typeof file> = {
    enabled: () => state.enabled,
    delay: () => 5,
    revision: () => state.revision,
    eligible: () => state.eligible,
    read: async () => state.disk,
    editors: () => editors,
    format: async () => {
      state.calls++;
      return "# title\n";
    },
    apply: (_editor, _before, after) => {
      state.applies++;
      state.buffer = after;
    },
    writeIfUnchanged: async (_file, before, after, valid) => {
      if (!valid() || state.disk !== before || editors.length) return false;
      state.writes++;
      state.disk = after;
      return true;
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

test("formats saved editors and ignores the save caused by its own output", async () => {
  const { file, state, formatter } = setup();
  assert.equal(await formatter.run(file), "formatted");
  assert.equal(state.applies, 1);
  assert.equal(state.writes, 0);
  state.disk = state.buffer;
  assert.equal(await formatter.run(file), "unchanged");
  assert.equal(state.calls, 1);
  formatter.dispose();
});

test("never formats an old disk version over pending editor input", async () => {
  const { file, state, formatter } = setup();
  state.buffer += "new input";
  assert.equal(await formatter.run(file), "stale");
  assert.equal(state.calls, 0);
  assert.equal(state.applies, 0);
});

test("handles Windows line endings normalized by the editor", async () => {
  const { file, state, host, formatter } = setup();
  state.disk = "#  title\r\n";
  const original = host.apply;
  host.apply = (editor, before, after) => {
    assert.equal(before, state.buffer);
    original(editor, before, after);
  };
  assert.equal(await formatter.run(file), "formatted");
  assert.equal(state.buffer, "# title\n");
  state.disk = "# title\r\n";
  assert.equal(await formatter.run(file), "unchanged");
  assert.equal(state.calls, 1);
});

test("discards results when editing, disk saves, settings, closure or unloading changes the snapshot", async () => {
  for (const change of [
    "input",
    "disk",
    "settings",
    "close",
    "unload",
    "disabled",
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
    if (change === "disk") state.disk += "external change";
    if (change === "settings") state.revision++;
    if (change === "close") fixture.close();
    if (change === "unload") formatter.dispose();
    if (change === "disabled") state.enabled = false;
    pending.resolve("# title\n");
    assert.equal(await task, "stale", change);
    assert.equal(state.applies + state.writes, 0, change);
    formatter.dispose();
  }
});

test("writes closed files through the comparison guard", async () => {
  const { file, state, formatter, close } = setup();
  close();
  assert.equal(await formatter.run(file), "formatted");
  assert.equal(state.writes, 1);
  assert.equal(state.disk, "# title\n");
});

test("detects a closed file changing during the atomic write", async () => {
  const { file, state, host, formatter, close } = setup();
  close();
  const original = host.writeIfUnchanged;
  host.writeIfUnchanged = async (...args) => {
    state.disk = "external edit";
    return original(...args);
  };
  assert.equal(await formatter.run(file), "stale");
  assert.equal(state.disk, "external edit");
});

test("manual command works when automatic formatting is disabled and buffer is unsaved", async () => {
  const { file, state, formatter } = setup();
  state.enabled = false;
  state.disk = "old disk";
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

test("debounces repeated saves and cancels scheduled work on unload", async () => {
  const { file, state, host, formatter } = setup();
  const applied = deferred<void>();
  const original = host.apply;
  host.apply = (...args) => {
    original(...args);
    applied.resolve();
  };
  formatter.schedule(file);
  formatter.schedule(file);
  formatter.schedule(file);
  await applied.promise;
  assert.equal(state.calls, 1);
  formatter.schedule(file);
  formatter.dispose();
  await new Promise((resolve) => setTimeout(resolve, 15));
  assert.equal(state.calls, 1);
});

test("serializes overlapping runs and retries the later save", async () => {
  const { file, state, host, formatter } = setup();
  const pending = deferred<string>();
  const started = deferred<void>();
  const retried = deferred<void>();
  host.format = () => {
    state.calls++;
    if (state.calls === 1) {
      started.resolve();
      return pending.promise;
    }
    retried.resolve();
    return Promise.resolve("# newer\n");
  };
  const first = formatter.run(file);
  await started.promise;
  state.disk = state.buffer = "#  newer\n";
  assert.equal(await formatter.run(file), "busy");
  pending.resolve("# title\n");
  assert.equal(await first, "stale");
  await retried.promise;
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(state.buffer, "# newer\n");
  assert.equal(state.calls, 2);
  formatter.dispose();
});
