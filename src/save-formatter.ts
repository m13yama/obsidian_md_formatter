export interface FormatTarget {
  getValue(): string;
}

export interface FormatterHost<File extends object> {
  enabled(): boolean;
  delay(): number;
  revision(): number;
  eligible(file: File, manual: boolean): boolean;
  read(file: File): Promise<string>;
  editors(file: File): FormatTarget[];
  format(source: string, file: File): Promise<string>;
  apply(editor: FormatTarget, before: string, after: string): void;
  writeIfUnchanged(
    file: File,
    before: string,
    after: string,
    valid: () => boolean,
  ): Promise<boolean>;
  report(error: unknown, file: File): void;
}

export type FormatResult =
  "formatted" | "unchanged" | "skipped" | "stale" | "busy" | "error";

/** Serialize each file; only apply results to the exact snapshot that was formatted. */
export class SaveFormatter<File extends object> {
  private timers = new Map<File, ReturnType<typeof setTimeout>>();
  private running = new Set<File>();
  private rerun = new Set<File>();
  private lastOutput = new WeakMap<File, string>();
  private disposed = false;

  constructor(private host: FormatterHost<File>) {}

  schedule(file: File): void {
    this.cancel(file);
    if (
      this.disposed ||
      !this.host.enabled() ||
      !this.host.eligible(file, false)
    )
      return;
    this.timers.set(
      file,
      setTimeout(() => {
        this.timers.delete(file);
        void this.run(file);
      }, this.host.delay()),
    );
  }

  cancel(file: File): void {
    const timer = this.timers.get(file);
    if (timer !== undefined) clearTimeout(timer);
    this.timers.delete(file);
  }

  reset(): void {
    for (const file of this.timers.keys()) this.cancel(file);
    this.rerun.clear();
    this.lastOutput = new WeakMap();
  }

  dispose(): void {
    this.disposed = true;
    this.reset();
  }

  async run(file: File, manual = false): Promise<FormatResult> {
    if (
      this.disposed ||
      (!manual && !this.host.enabled()) ||
      !this.host.eligible(file, manual)
    )
      return "skipped";
    if (this.running.has(file)) {
      if (!manual) this.rerun.add(file);
      return "busy";
    }
    this.cancel(file);
    this.running.add(file);
    const revision = this.host.revision();
    const valid = () =>
      !this.disposed &&
      this.host.revision() === revision &&
      (manual || this.host.enabled()) &&
      this.host.eligible(file, manual);
    try {
      const editors = this.host.editors(file);
      const editor = editors[0];
      const saved = manual && editor ? undefined : await this.host.read(file);
      const source = editor ? editor.getValue() : saved!;
      // A pending Obsidian save must never be overwritten with an older disk snapshot.
      // CodeMirror normalizes CRLF/CR in its buffer even if the saved file uses them.
      if (
        !manual &&
        saved !== undefined &&
        source.replace(/\r\n?/g, "\n") !== saved.replace(/\r\n?/g, "\n")
      )
        return "stale";
      if (editors.some((target) => target.getValue() !== source))
        return "stale";
      if (!manual && this.lastOutput.get(file) === source) return "unchanged";
      if (!valid()) return "stale";
      const formatted = await this.host.format(source, file);
      if (!valid()) return "stale";
      if (!manual && (await this.host.read(file)) !== saved) return "stale";
      if (!valid()) return "stale";
      const currentEditors = this.host.editors(file);
      if (currentEditors.some((target) => target.getValue() !== source))
        return "stale";
      if (editor && !currentEditors.includes(editor)) return "stale";
      if (source === formatted) {
        this.lastOutput.set(file, formatted);
        return "unchanged";
      }
      // Set before writing: Obsidian can synchronously emit another save event.
      this.lastOutput.set(file, formatted);
      const currentEditor = currentEditors[0];
      if (currentEditor) {
        this.host.apply(currentEditor, source, formatted);
      } else {
        const written = await this.host.writeIfUnchanged(
          file,
          source,
          formatted,
          valid,
        );
        if (!written) {
          this.lastOutput.delete(file);
          return "stale";
        }
      }
      return "formatted";
    } catch (error) {
      this.lastOutput.delete(file);
      if (!this.disposed) this.host.report(error, file);
      return "error";
    } finally {
      this.running.delete(file);
      if (this.rerun.delete(file)) this.schedule(file);
    }
  }
}
