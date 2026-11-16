/**
 * The query tab's CodeMirror editor. The language (highlighting, completion) is not fixed here: it comes from the
 * engine's `LanguageSupport.editorExtensions` and is swapped in with `setEditorLanguage` (when it has loaded, or when
 * the database or the language changes).
 */
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { Compartment, Prec, RangeSetBuilder, type Extension } from "@codemirror/state";
import { Decoration, EditorView, ViewPlugin, keymap, type DecorationSet, type ViewUpdate } from "@codemirror/view";
import { tags } from "@lezer/highlight";
import { basicSetup } from "codemirror";
import type { TextRange } from "../../core/language";

const language = new Compartment();

const highlightStyle = HighlightStyle.define([
  { tag: tags.keyword, color: "var(--syn-keyword)", fontWeight: "600" },
  { tag: [tags.string, tags.special(tags.string)], color: "var(--syn-string)" },
  { tag: [tags.number, tags.bool, tags.null], color: "var(--syn-number)" },
  { tag: [tags.comment, tags.lineComment, tags.blockComment], color: "var(--syn-comment)", fontStyle: "italic" },
  { tag: [tags.typeName, tags.standard(tags.name), tags.propertyName], color: "var(--syn-type)" },
  { tag: [tags.operator, tags.punctuation], color: "var(--fg-3)" },
]);

const editorTheme = EditorView.theme({
  "&": { height: "100%", backgroundColor: "var(--editor-bg)", color: "var(--fg)", fontSize: "13px" },
  ".cm-scroller": { fontFamily: "var(--font-mono)", lineHeight: "1.55" },
  ".cm-content": { caretColor: "var(--fg)" },
  ".cm-gutters": { backgroundColor: "var(--surface-2)", color: "var(--fg-3)", borderRight: "1px solid var(--border)" },
  ".cm-activeLine": { backgroundColor: "var(--active-line)" },
  ".cm-activeLineGutter": { backgroundColor: "var(--active-line-gutter, var(--active-line))" },
  ".cm-active-statement": { backgroundColor: "var(--active-statement)" },
  "&.cm-focused .cm-cursor": { borderLeftColor: "var(--fg)" },
  "&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection": {
    backgroundColor: "var(--editor-selection, var(--selection)) !important",
  },
  ".cm-selectionMatch": {
    backgroundColor: "color-mix(in srgb, var(--editor-selection, var(--selection)) 40%, transparent)",
  },
  // Autocomplete & tooltips: solid background so underlying code does not bleed through.
  ".cm-tooltip": {
    zIndex: "35",
    backgroundColor: "var(--surface) !important",
    color: "var(--fg)",
    border: "1px solid var(--border)",
    borderRadius: "var(--radius)",
    boxShadow: "var(--shadow)",
    overflow: "hidden",
  },
  ".cm-tooltip.cm-tooltip-autocomplete": {
    backgroundColor: "var(--surface) !important",
    color: "var(--fg)",
    border: "1px solid var(--border)",
  },
  ".cm-tooltip-autocomplete ul": {
    fontFamily: "var(--font-mono)",
    backgroundColor: "var(--surface)",
  },
  ".cm-tooltip-autocomplete ul li": {
    padding: "3px 8px",
    display: "flex",
    alignItems: "center",
    gap: "6px",
    color: "var(--fg)",
    backgroundColor: "var(--surface)",
  },
  ".cm-tooltip-autocomplete ul li[aria-selected]": {
    backgroundColor: "var(--accent) !important",
    color: "var(--accent-fg) !important",
  },
  ".cm-completionDetail": {
    fontStyle: "normal",
    color: "var(--fg-3)",
    marginLeft: "auto",
    paddingLeft: "12px",
  },
  ".cm-tooltip-autocomplete ul li[aria-selected] .cm-completionDetail": {
    color: "var(--accent-fg)",
    opacity: "0.85",
  },
  ".cm-completionMatchedText": {
    textDecoration: "none",
    fontWeight: "bold",
    color: "inherit",
  },
  ".cm-completionIcon": {
    marginRight: "4px",
    opacity: "0.7",
  },
});

function activeStatementPlugin(locate?: (text: string, offset: number) => TextRange | null): Extension {
  if (!locate) return [];
  const lineDeco = Decoration.line({ class: "cm-active-statement" });
  return ViewPlugin.fromClass(
    class {
      decorations: DecorationSet;

      constructor(view: EditorView) {
        this.decorations = this.build(view);
      }

      update(update: ViewUpdate) {
        if (update.docChanged || update.selectionSet || update.viewportChanged) {
          this.decorations = this.build(update.view);
        }
      }

      build(view: EditorView): DecorationSet {
        try {
          const { state } = view;
          const sel = state.selection.main;
          if (!sel.empty) return Decoration.none;
          const doc = state.doc.toString();
          if (!doc.trim()) return Decoration.none;
          const range = locate(doc, sel.head);
          if (!range || range.from === range.to) return Decoration.none;
          if (!doc.slice(range.from, range.to).trim()) return Decoration.none;

          const startLine = state.doc.lineAt(range.from);
          const endLine = state.doc.lineAt(Math.min(range.to, state.doc.length));
          if (sel.head < startLine.from || sel.head > endLine.to) return Decoration.none;

          const builder = new RangeSetBuilder<Decoration>();
          for (let l = startLine.number; l <= endLine.number; l++) {
            const line = state.doc.line(l);
            builder.add(line.from, line.from, lineDeco);
          }
          return builder.finish();
        } catch {
          return Decoration.none;
        }
      }
    },
    {
      decorations: (v) => v.decorations,
    },
  );
}

export interface EditorCommands {
  /** Ctrl+Enter / F9: the selection, or the statement under the cursor. */
  run(): void;
  /** Ctrl+Shift+Enter: the selection, or all statements. */
  runAll?(): void;
  /** Run the statement under the cursor. */
  runStatement?(): void;
  /** Shift+Alt+F. */
  format(): void;
  /** The text changed (typing, paste, format, an insert from the history). */
  changed?(): void;
  /** Locate the statement enclosing `offset` in `text`. */
  locateStatement?(text: string, offset: number): TextRange | null;
}

export function createSqlEditor(parent: HTMLElement, doc: string, commands: EditorCommands): EditorView {
  const command = (action: () => void) => () => {
    action();
    return true;
  };
  return new EditorView({
    parent,
    doc,
    extensions: [
      Prec.highest(
        keymap.of([
          { key: "Mod-Shift-Enter", run: command(commands.runAll ?? commands.runStatement ?? commands.run) },
          { key: "Mod-Enter", run: command(commands.runStatement ?? commands.run) },
          { key: "F9", run: command(commands.runStatement ?? commands.run) },
          { key: "Shift-Alt-f", run: command(commands.format) },
        ]),
      ),
      basicSetup,
      language.of([]),
      activeStatementPlugin(commands.locateStatement),
      syntaxHighlighting(highlightStyle),
      editorTheme,
      EditorView.updateListener.of((update) => {
        if (update.docChanged) commands.changed?.();
      }),
    ],
  });
}

/** Replaces the language extensions (from `LanguageSupport.editorExtensions`). */
export function setEditorLanguage(view: EditorView, extensions: Extension[]): void {
  view.dispatch({ effects: language.reconfigure(extensions) });
}

export function selectedOrAllText(view: EditorView): string {
  const { state } = view;
  const selected = state.selection.ranges
    .filter((range) => !range.empty)
    .map((range) => state.sliceDoc(range.from, range.to))
    .join("\n");
  return selected || state.doc.toString();
}
