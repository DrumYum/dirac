Fork of [dirac-run/dirac](https://github.com/dirac-run/dirac). Not affiliated with the original authors.
Dirac itself builds on [Cline](https://github.com/cline/cline) — credit to their team for the foundation.

## Changes over upstream

### Settings
- **Auto Format After Edit** — new toggle in Settings → Features → Editor. Off by default. When enabled, `edit_file` runs the configured formatter after applying changes.

### edit_file improvements
- **`delete` edit type** — delete line(s) without specifying `text` or `end_anchor`. Single-line delete: just `anchor`. Multi-line: add `end_anchor`.
- **Context lines in anchor errors** — when anchor content doesn't match, the error now shows 2 lines before/after the target with line numbers (marked `>>>`), so you can find the right anchor without guessing.

### UI fixes
- **@ mention fix** — selecting a file from the autocomplete menu no longer duplicates the typed query (stale closure bug in `useMentionTrait`).

### Cleanup
- **Removed dead "Edit (anchors)" auto-approve toggle** — the `applyDiff` setting was never read by any logic; removed from settings and UI.

## License
Apache License 2.0. See [LICENSE](LICENSE).
