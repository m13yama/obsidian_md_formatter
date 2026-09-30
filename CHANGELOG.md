# Changelog

## 0.3.0 — Beta 4

- Automatically wrap bare HTTP/HTTPS URLs in angle brackets, including URLs in headings, lists, block quotes, and tables. Existing links, code, protected Obsidian syntax, and elements marked with `prettier-ignore` are excluded from this conversion.
- Account for the added brackets when aligning tables and wrapping text, and keep repeated formatting stable.
- Translate the README, changelog, and comments in documentation examples into English.

## 0.2.1 — Beta 3

- Fixed an issue where Obsidian's save shortcut handler prevented Ctrl/Cmd+S events from reaching the plugin, so formatting did not run. The fix supports both the main window and pop-out windows.

## 0.2.0 — Beta 2

- Changed Ctrl+S (Cmd+S on macOS) to format the current note and save the formatted result in addition to performing the normal save.
- Removed formatting triggered by autosaves, synchronization, and external changes. Already saved notes can also be formatted with Ctrl/Cmd+S.
- Removed the autosave delay and closed-note formatting settings. Preserved the existing enabled/disabled setting and the manual formatting command.

## 0.1.0 — Beta 1

Initial beta release, distributed as a GitHub pre-release.

- Markdown formatting on save with Prettier, including support for Obsidian autosave.
- A Japanese settings interface, custom JSON options, JSON configuration files within the vault, and per-file overrides.
- Table formatting that counts fullwidth characters as two columns and halfwidth characters as one, including Japanese text in highlights and comments.
- Preservation of callouts, wiki links, embeds, highlights, comments, math, and templates.
- YAML frontmatter preservation, optional code block formatting, path exclusions, and file size limits.
- Protection against save conflicts and repeated save loops, deferral during IME composition, and preservation of the cursor, selections, and scroll position.
- Commands for manual formatting and toggling formatting on save.

Requires Obsidian 1.5.0 or later. Automated tests and browser builds have been verified, but GUI testing in Obsidian and on mobile devices has not been performed.
