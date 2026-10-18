# Pele and Mermaid Support Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans to implement this plan task-by-task after user review. Track progress with the checkboxes below.

**Goal:** Edit standard Mermaid fenced code blocks and display live diagrams inside M Note, without changing the Markdown file format.

**Architecture:** Extend the existing code-block React node view with a separate, non-editable diagram preview. Preserve the existing Tiptap codeBlock document node and Markdown serialization. Bundle Pele locally and keep its lifecycle inside a small preview component.

**Tech stack:** Existing Electron, React 19, Tiptap 3, Lowlight, Vite and Vitest; add a pinned Pele dependency.

**Design status:** Proposed plan, not an approved implementation. The design brief and assumptions are recorded below; no product code or dependencies have been changed.

## Design brief and renderer choice

The requested outcome is Pele integration and Mermaid syntax support in the existing Markdown editor. Proposed UX: source stays editable, with a preview below Mermaid blocks. Users create diagrams by selecting Mermaid in the existing language selector or entering a Mermaid fence. No extra toolbar button is necessary for the first release.

Recommend Pele for its CSS-variable theming and built-in preview update and resize lifecycle. Mermaid.js is the alternative when reference Mermaid layout and configuration compatibility matter more. Shipping both introduces extra bundle and fallback behaviour; defer it until real documents justify it.

Pele documents support for Mermaid 12.1.0 built-in diagram types, but uses its own layout. Mermaid themes/themeVariables, arbitrary HTML labels, and external plugins are not equivalent or supported. Do not promise pixel-identical Mermaid.js output or universal syntax compatibility. Source remains portable even when rendering differs.

## Global constraints

- Persist Mermaid as a codeBlock with language `mermaid`; never serialize preview SVG, errors, or controls.
- Keep normal code blocks, copy-code behaviour, undo/redo, search, file opening, saving and Copy Markdown working.
- Keep source visible on errors, unsupported syntax, and empty blocks.
- Bundle all runtime assets locally; no CDN or network requirement for rendering.
- Initial release disables diagram links and images and supplies no custom icon markup.
- Use app-controlled rendering options and Pele's size limits; do not relax Electron security or CSP.
- Preview updates do not dispatch document transactions or mark files dirty.
- No export feature, renderer preference UI, or editor-wide refactor in this scope.

## Existing integration points

- `src/components/tiptap-node/code-block-node/code-block-node.tsx`: editable source, language selector and copy control.
- `src/components/tiptap-node/code-block-node/code-block-node-extension.ts`: CodeBlockLowlight and React node-view registration.
- `src/components/tiptap-templates/simple/simple-editor.tsx`: registers Markdown and CodeBlock; imports Markdown and saves through getMarkdown().
- `src/components/tiptap-node/code-block-node/code-block-node.scss`: existing code-block styling.
- `src/styles/_variables.scss`: light/dark palette.
- `src/__tests__/`: Vitest tests; use per-file jsdom where DOM behaviour is required.

## Review focus

1. Markdown round trips preserve diagram source and language, including invalid diagrams.
2. Undo/redo updates the selector and preview, without modifying source unexpectedly.
3. Deleting blocks or switching documents cleans up observers and scheduled updates.
4. Untrusted source cannot execute markup or initiate diagram image requests/navigation.
5. Large or malformed diagrams do not break neighbouring blocks or the editing session.

## Task 1: Establish Markdown preservation and dependency

**Files:** `package.json`, `package-lock.json`; create `src/__tests__/mermaid-markdown.test.ts`.

- [ ] Add integration fixtures using the actual Markdown and CodeBlock extensions: valid flowchart, sequence diagram, invalid Mermaid, empty block, multiple blocks, indentation, diagram frontmatter, and a normal TypeScript block.
- [ ] Verify import produces language `mermaid`, preserves source, and export/reimport retains the same code-block content and language. Do not require unrelated whitespace normalization outside the block to be byte-identical.
- [ ] Run `npm test -- src/__tests__/mermaid-markdown.test.ts`. Existing serialization may already pass; treat these as regression coverage, not artificially failing tests.
- [ ] Resolve the published Pele version at implementation time, inspect its exports/types and license, and pin that exact version with the lockfile. Add no Mermaid.js dependency.
- [ ] Confirm unknown `mermaid` highlighting does not throw or rewrite source. Modify the existing extension only if the integration test exposes a concrete issue.
- [ ] Commit the dependency and preservation tests after they pass.

## Task 2: Implement the isolated preview

**Create:** `src/components/tiptap-node/code-block-node/mermaid-preview.tsx`, `src/__tests__/mermaid-preview.test.tsx`.

**Interface:** `MermaidPreview({ source }: { source: string })` renders a non-editable preview; it never receives editor mutation callbacks.

- [ ] Write failing component tests for mounting, source changes, empty content, invalid content recovery, unmount cleanup and multiple independent previews. Mock the Pele lifecycle for these tests and add real-render smoke tests for a flowchart and sequence diagram.
- [ ] Run `npm test -- src/__tests__/mermaid-preview.test.tsx` and confirm failures reflect missing functionality.
- [ ] Implement using Pele `mount`, `update` and `destroy`. Debounce source changes by 150 ms; cancel pending work on unmount. Avoid mounting an empty source and show a plain-text prompt instead.
- [ ] Set `links: false`, `images: false`, `autoDirection: false`, and `zoom: false` initially. Keep source direction stable and let the preview resize within its container. Preserve default resource limits.
- [ ] Use Pele's inline error display for parse errors, with a React error boundary/state for unexpected integration failures. Errors must be displayed as text. A retained previous diagram must be visibly marked stale when the source is invalid.
- [ ] Test malicious labels/URLs and over-limit input with the real renderer: no executable markup, outgoing image references, or active links; source remains editable elsewhere in the node view.
- [ ] Re-run the targeted tests and commit when passing.

## Task 3: Connect Mermaid to code-block editing

**Modify:** `src/components/tiptap-node/code-block-node/code-block-node.tsx`.
**Create:** `src/__tests__/mermaid-code-block.test.tsx`.

- [ ] Add failing tests for choosing Mermaid, loaded Mermaid blocks, language changes through undo/redo, and switching back to a normal language.
- [ ] Make the language selector controlled by node attributes rather than defaultValue. Add one explicit Mermaid option, independent of Lowlight's language list.
- [ ] Render MermaidPreview below the existing editable NodeViewContent only for language `mermaid`. Keep the source content DOM mounted and preview/controls outside the editable content.
- [ ] Preserve the existing copy-code button: it copies source, not SVG. Do not add preview state to node attributes.
- [ ] Verify typing a Mermaid fence, pasting Markdown, opening a file, saving and Copy Markdown through the real editor. Confirm preview refreshes do not produce dirty-state changes.
- [ ] Run the new tests plus `src/__tests__/code-block-copy.test.ts` and the Task 1 tests; commit when passing.

## Task 4: Theme, verify and document

**Create:** `src/components/tiptap-node/code-block-node/mermaid-preview.scss`.
**Modify:** preview component style import; `README.md`.

- [ ] Map Pele foreground, background, surface, border and error variables to M Note's light/dark palette. Scope styles to the preview so SVG text does not inherit code-token formatting.
- [ ] Constrain preview width and provide overflow for diagrams that cannot fit. Keep errors readable and controls keyboard accessible; respect Mermaid accessibility titles/descriptions.
- [ ] Manually verify light/dark themes, narrow windows, long labels, multiple diagrams, selection, copy/paste, undo/redo, document switching and block deletion in Electron.
- [ ] Exercise a document containing 20 small diagrams and a large diagram near configured limits while editing and resizing. If synchronous rendering visibly stalls typing, introduce a worker with cancellation before shipping; debounce alone does not bound rendering time.
- [ ] Run `npm test`, `npm run lint`, and `git diff --check`; distinguish baseline failures from introduced failures. Run the local renderer build and `npm start` smoke check. Verify a locally packaged app renders without network access; do not run the release script.
- [ ] Document a Mermaid fence example, source-plus-preview behaviour, error handling, and Pele compatibility differences. Commit after checks pass.

## Acceptance criteria

- A saved Mermaid fence opens as editable source with an inline diagram and works offline.
- Editing source updates only its preview; errors do not discard source or break the document.
- Save/reopen and Copy Markdown preserve Mermaid language and source; no SVG or UI appears in Markdown output.
- Normal code blocks retain their current behaviour.
- Themes and window resizing work, with no observer/timer leaks on removal.

## References

- [Pele API and lifecycle](https://pele.run/api), also retrieved through Context7 `/obsidianmd/pele`.
- [Pele compatibility](https://pele.run/compatibility).
- [Pele security and resource limits](https://pele.run/security).
- [Mermaid.js usage](https://mermaid.js.org/config/usage.html).
- [Mermaid.js theme configuration](https://mermaid.js.org/config/theming.html).

## Implementation verification — 2026-10-18

Implemented on `feat/pele-mermaid`, with Pele 1.6.0 and real-renderer tests rather than lifecycle mocks. Work stayed in the existing checkout on a feature branch; the dependent tasks are grouped into one feature commit.

- 124 tests pass across 20 files, including Markdown preservation, real previews, invalid-input recovery, limits, security cases, undo/redo, copy and cleanup.
- ESLint: zero errors; existing warnings remain alongside test non-null assertion warnings.
- Production renderer build and unsigned local Electron package build pass.
- Electron UI checks: typed fences, light/dark themes, 20 diagrams, and editing a 46 KB dense diagram pass. Rendering remains synchronous; this is a smoke check, not a hard latency guarantee. Narrow-window resizing was not separately manually exercised.
- Packaged flowchart and sequence previews work with Chromium hostname resolution blocked. Saving edited source preserves Mermaid fences without generated SVG.
- Plain-text pasted fences remain literal, matching existing paste behaviour; type the fence or import a Markdown file to parse it.
- Independent review found no critical or important correctness defects. Its security coverage suggestion was addressed.
- `tsc --noEmit` still reports two pre-existing errors: missing `WindowBounds` in `src/main.ts:73`, and implicit `any[]` in `src/__tests__/fix-mac-update-manifest.test.ts:116`.
- Smoke packaging disabled signing/notarization only in temporary configuration. No release, publishing, or release configuration changes were made.
