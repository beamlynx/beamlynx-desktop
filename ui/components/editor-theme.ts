import { EditorView } from '@codemirror/view';
import { syntaxHighlighting } from '@codemirror/language';
import { oneDarkHighlightStyle } from '@codemirror/theme-one-dark';
import { Extension } from '@codemirror/state';

/**
 * Editor chrome (background, gutters, selection, cursor, tooltips) for both
 * Pine and SQL inputs - previously each editor just borrowed a third-party
 * theme wholesale (`oneDark` for dark, `@uiw/react-codemirror`'s own built-in
 * 'light' string for light), so the one surface a user spends the most time
 * in never actually looked like this app, just a generic embedded editor.
 *
 * Every color here is a `var(--canvas-*)` custom property, not a literal -
 * CSS custom properties resolve fine inside CodeMirror's own `EditorView.
 * theme()` style objects (they become real CSS rules), so this single
 * extension already tracks the light/dark toggle with no separate light/dark
 * JS variant needed; only the `dark` flag passed to `EditorView.theme` (a
 * few of CodeMirror's own internal fallbacks read it) needs to match.
 *
 * Token/syntax colors are intentionally NOT reinvented here - oneDark's own
 * `oneDarkHighlightStyle` (just the token-color mapping, not its chrome) is
 * kept for dark mode since it's already well-tuned; light mode falls back to
 * `@uiw/codemirror-extensions-basic-setup`'s bundled `defaultHighlightStyle`,
 * which every editor here already gets for free via `basicSetup`.
 */
export const editorChrome = (isDark: boolean): Extension =>
  EditorView.theme(
    {
      '&': {
        color: 'var(--canvas-text)',
        backgroundColor: 'var(--canvas-node-bg)',
        fontFamily: 'var(--code-font)',
        fontSize: 'calc(13px * var(--text-scale, 1))',
      },
      '.cm-content': {
        caretColor: 'var(--canvas-trace)',
        fontFamily: 'var(--code-font)',
        // Harmless for every other code font (they simply have no matching
        // glyphs to substitute) - only Fira Code actually implements
        // ligatures (=>, !=, etc merging into one glyph), which is exactly
        // the kind of visible difference a code font picker should surface.
        fontVariantLigatures: 'contextual',
      },
      '.cm-cursor, .cm-dropCursor': { borderLeftColor: 'var(--canvas-trace)' },
      // Selection now decides what actually runs (selecting text in SQL mode runs only
      // the selection), so it needs to read as its own state, not blend into the
      // activeLine/matching-bracket chip tone below. Tinted with the app's one accent
      // (--canvas-trace) rather than a new color, at two strengths so it dims like a
      // normal editor's selection does once focus leaves the editor. The mix percentage
      // is much higher in light mode than dark: mixing a color into a near-white
      // background (light's --canvas-node-bg) needs a far stronger dose to reach the
      // same contrast that the same percentage gets for free against dark's near-black one.
      '.cm-selectionBackground, .cm-content ::selection': {
        backgroundColor: isDark
          ? 'color-mix(in srgb, var(--canvas-trace) 18%, var(--canvas-node-bg))'
          : 'color-mix(in srgb, var(--canvas-trace) 35%, var(--canvas-node-bg))',
      },
      '&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground': {
        backgroundColor: isDark
          ? 'color-mix(in srgb, var(--canvas-trace) 38%, var(--canvas-node-bg))'
          : 'color-mix(in srgb, var(--canvas-trace) 70%, var(--canvas-node-bg))',
      },
      // Translucent, not solid: CodeMirror paints the selection layer behind the content
      // layer (z-index -2), and the active line lives inside the content layer - a solid
      // fill here would fully hide the selection highlight above whenever the selection
      // is on the current line, which is the common case.
      '.cm-activeLine': {
        backgroundColor: 'color-mix(in srgb, var(--canvas-chip-bg) 60%, transparent)',
      },
      '.cm-activeLineGutter': { backgroundColor: 'var(--canvas-chip-bg)' },
      '.cm-gutters': {
        backgroundColor: 'var(--canvas-node-bg)',
        color: 'var(--canvas-text-dim)',
        border: 'none',
        borderRight: '1px solid var(--canvas-node-border)',
      },
      '&.cm-focused .cm-matchingBracket, &.cm-focused .cm-nonmatchingBracket': {
        backgroundColor: 'var(--canvas-chip-bg)',
        outline: '1px solid var(--canvas-trace)',
      },
      '.cm-tooltip': {
        backgroundColor: 'var(--canvas-picker-bg)',
        border: '1px solid var(--canvas-picker-border)',
        color: 'var(--canvas-text)',
        fontFamily: 'var(--code-font)',
      },
      '.cm-tooltip-autocomplete ul li[aria-selected]': {
        backgroundColor: 'var(--canvas-chip-bg)',
        color: 'var(--canvas-text)',
      },
      '.cm-panels': {
        backgroundColor: 'var(--canvas-picker-bg)',
        color: 'var(--canvas-text)',
      },
    },
    { dark: isDark },
  );

/** Dark-mode-only: oneDark's token-color mapping, without its own chrome theme (see editorChrome above). */
export const editorDarkSyntax = syntaxHighlighting(oneDarkHighlightStyle);
