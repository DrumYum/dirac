Fork of [dirac-run/dirac](https://github.com/dirac-run/dirac). Not affiliated with the original authors.
Dirac itself builds on [Cline](https://github.com/cline/cline) — credit to their team for the foundation.

## Changes over upstream

### Settings
- **Auto Format After Edit** — new toggle in Settings → Running Tasks. Off by default. When enabled, `edit_file` runs the configured formatter after applying changes.
- **Preserve thinking in context** — new dropdown in model settings (OpenAI-compatible). Off by default. Three modes: `off` (discard after each step), `interleaved` (keep across tool calls within the current turn), `all` (keep across the entire conversation).

### edit_file improvements
- **`delete` edit type** — delete line(s) without specifying `text` or `end_anchor`. Single-line delete: just `anchor`. Multi-line: add `end_anchor`.
- **Context lines in anchor errors** — when anchor content doesn't match, the error now shows 2 lines before/after the target with line numbers (marked `>>>`), so you can find the right anchor without guessing.

### Thinking indicator
- **"in context" badge** — thinking blocks that are currently visible to the model show a small badge and highlighted lightbulb icon. Visual feedback updates in real time as you interact.

### R1 format removal
- **Removed `r1-format.ts`** and the `isR1FormatRequired` flag. All providers (DeepSeek, Kimi/Moonshot, Fireworks, Groq, Nebius, Together, Qwen, SambaNova, Bedrock, Vercel AI Gateway) now use a unified `preserveThinking` setting in `convertToOpenAiMessages`. This fixes tool-call handling for Qwen3/DeepSeek (the old `convertToR1Format` silently dropped tool calls) and eliminates triple message conversion in `openai.ts`.

### UI fixes
- **@ mention fix** — selecting a file from the autocomplete menu no longer duplicates the typed query (stale closure bug in `useMentionTrait`).

### Cleanup
- **Removed dead "Edit (anchors)" auto-approve toggle** — the `applyDiff` setting was never read by any logic; removed from settings and UI.
- **Removed 3 dead settings sections** — `AboutSection`, `DebugSection`, `FeatureSettingsSection` were unmounted leftovers from a settings restructure; all their content was already duplicated in active sections.
- **package.json** — removed marketplace publish scripts and unused CLI/eval/docs scripts; simplified build pipeline.

## License
Apache License 2.0. See [LICENSE](LICENSE).
