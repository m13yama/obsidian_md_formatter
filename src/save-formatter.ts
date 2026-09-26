export interface FormatTarget {
  getValue(): string;
}

export interface FormatterHost<File extends object> {
  enabled(): boolean;
  revision(): number;
  eligible(file: File): boolean;
  editors(file: File): FormatTarget[];
  format(source: string, file: File): Promise<string>;
  apply(editor: FormatTarget, before: string, after: string): void;
  report(error: unknown, file: File): void;
}

export type FormatResult =
  "formatted" | "unchanged" | "skipped" | "stale" | "busy" | "error";

/** Format explicit requests only; apply results to the exact editor snapshot. */
export class SaveFormatter<File extends object> {
  private running = new Set<File>();
  private disposed = false;

  constructor(private host: FormatterHost<File>) {}

  dispose(): void {
    this.disposed = true;
  }

  async run(file: File, manual = false): Promise<FormatResult> {
    if (
      this.disposed ||
      (!manual && !this.host.enabled()) ||
      !this.host.eligible(file)
    )
      return "skipped";
    if (this.running.has(file)) return "busy";
    this.running.add(file);
    const revision = this.host.revision();
    const valid = () =>
      !this.disposed &&
      this.host.revision() === revision &&
      (manual || this.host.enabled()) &&
      this.host.eligible(file);
    try {
      const editors = this.host.editors(file);
      const editor = editors[0];
      if (!editor) return "skipped";
      // Ctrl/Cmd+S can arrive before the latest input has been saved to disk.
      const source = editor.getValue();
      if (editors.some((target) => target.getValue() !== source))
        return "stale";
      if (!valid()) return "stale";
      const formatted = await this.host.format(source, file);
      if (!valid()) return "stale";
      const currentEditors = this.host.editors(file);
      if (currentEditors.some((target) => target.getValue() !== source))
        return "stale";
      if (!currentEditors.includes(editor)) return "stale";
      if (source === formatted) return "unchanged";
      this.host.apply(editor, source, formatted);
      return "formatted";
    } catch (error) {
      if (!this.disposed) this.host.report(error, file);
      return "error";
    } finally {
      this.running.delete(file);
    }
  }
}
