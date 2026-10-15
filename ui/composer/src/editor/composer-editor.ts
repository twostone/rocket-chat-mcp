import { Editor, Extension } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import TaskItem from "@tiptap/extension-task-item";
import TaskList from "@tiptap/extension-task-list";
import { Fragment, Slice } from "@tiptap/pm/model";
import type { Node } from "@tiptap/pm/model";
import { Plugin, TextSelection } from "@tiptap/pm/state";
import type { EditorState, Transaction } from "@tiptap/pm/state";
import type { PMDoc } from "../lib/pm-to-ast";

/**
 * Creates the composer's WYSIWYG editor (ratified v1 scope) with its
 * keyboard contract:
 *
 * - Shift+Enter inserts a BLANK LINE (Rocket.Chat LINE_BREAK semantics),
 *   not a soft break: the caret's block is split and one empty paragraph is
 *   wedged between the halves — the shape `pmToAst` maps to exactly one
 *   LINE_BREAK, so what the user sees is what gets sent.
 * - Tab is consumed (no-op): it neither indents nor moves focus.
 * - Paste takes plain text only (formatted clipboard payloads are dropped);
 *   file drops are rejected with a status note.
 *
 * The editor is created headlessly on a detached container div; the
 * component embeds the same factory. The caller owns disposal.
 */

/**
 * Inserts one visible blank line at the caret. The caret's text block is
 * replaced by three blocks of the same type — the text before the caret,
 * one empty block, and the text after it — with the caret moved to the
 * start of the trailing half. An empty block between real content
 * serializes to exactly one LINE_BREAK (see `pmToAst`).
 */
export const insertBlankLine = (
  state: EditorState,
  dispatch: (tr: Transaction) => void
): boolean => {
  const { $from } = state.selection;
  if (!state.selection.empty || !$from.parent.isTextblock) {
    return false;
  }
  const block = $from.parent;
  const offset = $from.pos - $from.start($from.depth);
  // Textblock types always admit an empty fill, so the nullable API is safe
  // to tighten here.
  const empty = (): Node => block.type.createAndFill() as Node;
  const left: Node =
    offset === 0
      ? empty()
      : block.type.createChecked(null, block.slice(0, offset).content);
  const right: Node =
    offset === block.content.size
      ? empty()
      : block.type.createChecked(null,
          block.slice(offset, block.content.size).content);
  const blockStart = $from.before($from.depth);
  const tr = state.tr.replace(
    blockStart,
    blockStart + block.nodeSize,
    new Slice(Fragment.from([left, empty(), right]), 0, 0)
  );
  tr.setSelection(
    TextSelection.near(tr.doc.resolve(blockStart + left.nodeSize + 1))
  );
  dispatch(tr);
  return true;
};

/**
 * The ratified keyboard contract as its own extension. A direct
 * `handleKeyDown` prop (rather than the keymap plugin) so the contract is
 * evaluated before ProseMirror's built-in defaults and wins every conflict,
 * notably shift-enter (otherwise StarterKit's soft break eats it).
 */
const ComposerKeys = Extension.create({
  name: "composerKeys",

  addProseMirrorPlugins() {
    // The editor from the extension instance (inside the Plugin below,
    // `this` would be the plugin and carry no editor).
    const editor = this.editor;
    return [
      new Plugin({
        props: {
          handleKeyDown(_view, event) {
            if (event.key === "Enter" && event.shiftKey) {
              event.preventDefault();
              if (editor) {
                insertBlankLine(
                  editor.state,
                  (tr) => editor.view.dispatch(tr as unknown as never)
                );
              }
              return true;
            }
            if (event.key === "Tab") {
              event.preventDefault();
              return true;
            }
            return false;
          },
        },
      }),
    ];
  },
});

/**
 * Converts a plain-text clipboard payload into the content spec TipTap
 * inserts: every line becomes a text run and each line break becomes a
 * hard break (the editor rendering of a Rocket.Chat LINE_BREAK — see
 * `pmToAst`). Empty interior lines collapse (a hard break with no adjacent
 * text still renders as a line). The clipboard's rich payload is deliberately
 * ignored upstream, so formatted content can never smuggle markup in.
 */
export function pasteSpecFromText(text: string): unknown[] {
  const lines = text.split(/\r?\n/);
  const spec: unknown[] = [];
  lines.forEach((line, i) => {
    if (i > 0) {
      spec.push({ type: "hardBreak" });
    }
    if (line.length > 0) {
      spec.push({ type: "text", text: line });
    }
  });
  return spec;
}

/**
 * Paste sanitisation (ratified: plain text only). The clipboard's rich
 * payload is discarded; only its plain-text representation is inserted,
 * with each line break becoming a hard break (the editor rendering of a
 * LINE_BREAK — see `pmToAst`). Rich content from other apps can therefore
 * never smuggle markup into the document.
 */
const PlainTextPaste = Extension.create({
  name: "composerPlainTextPaste",

  addProseMirrorPlugins() {
    // The editor at extension scope (`this.editor`); inside the Plugin
    // below, `this` would be the plugin and carry no editor.
    const editor = this.editor;
    return [
      new Plugin({
        props: {
          handlePaste(_state, event) {
            const data = (event as ClipboardEvent).clipboardData;
            if (!data) {
              return false;
            }
            const spec = pasteSpecFromText(data.getData("text/plain"));
            event.preventDefault();
            if (spec.length > 0) {
              editor?.commands.insertContent(spec);
            }
            return true;
          },
        },
      }),
    ];
  },
});

export interface ComposerEditorOptions {
  /** TipTap doc (JSON) to load as the initial content. */
  initialContent: PMDoc;
  /**
   * Container to mount the editor in. Defaults to a detached div for
   * headless use; the React component passes its own element.
   */
  element?: HTMLElement;
  /** Called with a short note when a file drop is rejected. */
  onRejectDrop?: (note: string) => void;
  /** Called on every content update with the latest doc JSON. */
  onUpdate?: (json: PMDoc) => void;
  onDispose?: () => void;
}

/**
 * Drop decision (ratified: file drops are rejected). Pure so it can be
 * tested without a DOM: returns true and reports the note when the drop
 * carries files (nothing is ever inserted), false for ordinary drops
 * (ProseMirror's default behaviour stands).
 */
export function decideDrop(
  dataTransfer: { files?: Iterable<unknown> | null } | null | undefined,
  onReject: (note: string) => void
): boolean {
  let files: Iterable<unknown> | null | undefined;
  try {
    files = dataTransfer?.files;
  } catch {
    files = undefined;
  }
  // Any file present => reject. Spread to a length check; no iterator var to
  // trip the unused-var lint.
  if (files && [...files].length > 0) {
    onReject("Files can't be added to a draft message.");
    return true;
  }
  return false;
}

export function createComposerEditor(options: ComposerEditorOptions): Editor {
  const editor = new Editor({
    element: options.element ?? document.createElement("div"),
    extensions: buildExtensions(),
    content: options.initialContent as never,
    editorProps: {
      handleDrop(_state, event) {
        const dataTransfer = event.dataTransfer;
        if (decideDrop(dataTransfer, (note) => options.onRejectDrop?.(note))) {
          event.preventDefault();
          return true;
        }
        // Ratified plain-text-only applies to drops too: the rich payload is
        // discarded, only the text survives.
        const text = dataTransfer?.getData("text/plain") ?? "";
        const spec = pasteSpecFromText(text);
        if (spec.length > 0) {
          editor.commands.insertContent(spec);
        }
        event.preventDefault();
        return true;
      },
    },
    onUpdate: () => {
      options.onUpdate?.(editor.state.doc.toJSON() as unknown as PMDoc);
    },
    onDestroy: () => options.onDispose?.(),
  });
  return editor;
}

function buildExtensions() {
  return [
    StarterKit.configure({
      horizontalRule: false,
      underline: false,
    }),
    TaskList,
    TaskItem.configure({ nested: true }),
    PlainTextPaste,
    // Registered last: TipTap gives earlier extensions key priority, so the
    // contract must come after StarterKit to beat its shift-enter soft break.
    ComposerKeys,
  ];
}
