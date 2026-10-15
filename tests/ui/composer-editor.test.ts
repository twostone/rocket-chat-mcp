/** @vitest-environment jsdom */
import { describe, it, expect } from "vitest";
import type { Editor } from "@tiptap/core";
import type { PMDoc } from "../../ui/composer/src/lib/pm-to-ast";
import {
  createComposerEditor,
  decideDrop,
  insertBlankLine,
  pasteSpecFromText,
} from "../../ui/composer/src/editor/composer-editor";

function doc(text: string): PMDoc {
  return {
    type: "doc",
    content: [
      { type: "paragraph", content: [{ type: "text", text }] },
    ],
  };
}

type Disposer = () => void;
interface Built {
  editor: Editor;
  dispose: Disposer;
}

/**
 * Builds the real editor headlessly (no React) so commands and key bindings
 * can be exercised directly. Uses the same factory the component mounts.
 */
function makeEditor(initial: string): Built {
  const editor = createComposerEditor({ initialContent: doc(initial) });
  let disposed = false;
  return {
    editor,
    dispose: () => {
      if (!disposed) {
        disposed = true;
        editor.destroy();
      }
    },
  };
}

function dispatchRaw(editor: Editor, fn: (state: unknown, dispatch: (t: unknown) => void) => boolean) {
  return fn(editor.state, (tr: unknown) =>
    (editor.view as unknown as { dispatch: (t: unknown) => void }).dispatch(tr)
  );
}

function pressKey(editor: Editor, opts: { key: string; shift?: boolean }) {
  const dom = (editor.view as unknown as { dom: HTMLElement }).dom;
  const event = new KeyboardEvent("keydown", {
    key: opts.key,
    shiftKey: Boolean(opts.shift),
    bubbles: true,
    cancelable: true,
  });
  return !dom.dispatchEvent(event) ? true : false; // prevented => handled
}

function blocks(editor: Editor): string[] {
  const json = editor.state.doc.toJSON() as {
    content?: Array<{ content?: Array<{ text?: string }> }>;
  };
  return (json.content ?? []).map(
    (b) => (b.content ?? []).map((c) => c.text ?? "").join("")
  );
}

describe("insertBlankLine command (ratified: shift+enter = a blank line)", () => {
  it("splits at the caret and inserts one empty paragraph", () => {
    const { editor, dispose } = makeEditor("ab cd");
    try {
      editor.commands.setTextSelection(3); // caret after "ab" (text starts at doc pos 1)
      expect(dispatchRaw(editor, insertBlankLine)).toBe(true);
      expect(blocks(editor)).toEqual(["ab", "", " cd"]);
    } finally {
      dispose();
    }
  });

  it("keeps the caret's block type for the blank line", () => {
    const { editor, dispose } = makeEditor("abc");
    try {
      editor.commands.setTextSelection(4); // caret at end of "abc" (text spans 2..4)
      expect(dispatchRaw(editor, insertBlankLine)).toBe(true);
      const types = ((editor.state.doc.toJSON() as {
        content?: Array<{ type: string }>;
      }).content ?? []).map((n) => n.type);
      expect(types).toEqual(["paragraph", "paragraph", "paragraph"]);
      // TipTap's getText() joins blocks with "\n\n"
      expect(editor.getText()).toBe("abc\n\n\n\n");
    } finally {
      dispose();
    }
  });

  it("wires Shift-Enter to the blank line", () => {
    const { editor, dispose } = makeEditor("xy");
    try {
      editor.commands.setTextSelection(2); // caret after "x" (text spans 1..2)
      const handled = pressKey(editor, { key: "Enter", shift: true });
      expect(handled).toBe(true);
      expect(blocks(editor)).toEqual(["x", "", "y"]);
      // TipTap's getText() joins blocks with "\n\n"
      expect(editor.getText()).toBe("x\n\n\n\ny");
    } finally {
      dispose();
    }
  });

  it("consumes Tab (no-op) so it cannot indent or hop focus", () => {
    const { editor, dispose } = makeEditor("xy");
    try {
      editor.commands.setTextSelection(1);
      const handled = pressKey(editor, { key: "Tab" });
      expect(handled).toBe(true);
      expect(blocks(editor)).toEqual(["xy"]);
    } finally {
      dispose();
    }
  });

  it("leaves a plain Enter to StarterKit (soft split, no blank line)", () => {
    const { editor, dispose } = makeEditor("xy");
    try {
      editor.commands.setTextSelection(2); // caret after "x"
      const handled = pressKey(editor, { key: "Enter" });
      expect(handled).toBe(true);
      // plain enter from StarterKit: one split -> two blocks, no blank line
      expect(blocks(editor)).toEqual(["x", "y"]);
    } finally {
      dispose();
    }
  });
});

describe("paste sanitisation (ratified: plain text only)", () => {
  it("converts a single line to one text node", () => {
    expect(pasteSpecFromText("hello")).toEqual([
      { type: "text", text: "hello" },
    ]);
  });

  it("maps each line break to a hard break between text runs", () => {
    expect(pasteSpecFromText("a\nb")).toEqual([
      { type: "text", text: "a" },
      { type: "hardBreak" },
      { type: "text", text: "b" },
    ]);
  });

  it("accepts Windows line endings", () => {
    expect(pasteSpecFromText("a\r\nb")).toEqual([
      { type: "text", text: "a" },
      { type: "hardBreak" },
      { type: "text", text: "b" },
    ]);
  });

  it("drops empty interior lines but keeps their line breaks", () => {
    expect(pasteSpecFromText("a\n\nb")).toEqual([
      { type: "text", text: "a" },
      { type: "hardBreak" },
      { type: "hardBreak" },
      { type: "text", text: "b" },
    ]);
  });

  it("yields nothing for an empty clipboard", () => {
    expect(pasteSpecFromText("")).toEqual([]);
  });

  it("emits only text and hard-break nodes — never marks or rich nodes", () => {
    // The point of sanitisation is structural: whatever characters the plain
    // text carries, they land as inert text nodes; no mark, heading, or
    // other node type is ever introduced.
    const spec = pasteSpecFromText(
      "**bold** <script>alert(1)</script>\n*em*\n<i>x</i>"
    );
    for (const item of spec) {
      const node = item as { type: string };
      expect(["text", "hardBreak"]).toContain(node.type);
      expect(node).not.toHaveProperty("marks");
    }
  });

  it("inserts plain text at the caret, ignoring any clipboard HTML", () => {
    const { editor, dispose } = makeEditor("head");
    try {
      const view = editor.view as unknown as { dom: HTMLElement };
      const event = new Event("paste") as ClipboardEvent;
      Object.defineProperty(event, "clipboardData", {
        value: {
          getData: (type: string) =>
            type === "text/plain" ? "pasted <b>line</b>" : "<b>bogus</b>",
        },
      });
      view.dom.dispatchEvent(event);
      // The editor's content grew by the plain text — the bogus HTML never
      // landed (there is no bold/emphasis node in the doc).
      const text = editor.getText();
      expect(text).toContain("pasted <b>line</b>");
      const json = JSON.stringify(editor.state.doc.toJSON());
      expect(json.includes('"strong"')).toBe(false);
    } finally {
      dispose();
    }
  });

  it("rejects a file-bearing drop with a status note (pure decision)", () => {
    let note: string | null = null;
    const verdict = decideDrop(
      { files: [{ name: "photo.png" }] },
      (n) => {
        note = n;
      }
    );
    expect(verdict).toBe(true);
    expect(note).toMatch(/files/i);
  });

  it("lets ordinary drops fall through (pure decision)", () => {
    let note = 0;
    expect(
      decideDrop({ files: [] }, () => note++)
    ).toBe(false);
    expect(decideDrop(null, () => note++)).toBe(false);
    expect(note).toBe(0);
  });
});
