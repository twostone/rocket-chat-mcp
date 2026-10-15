import { useEffect, useRef, useState } from "react";
import type { Editor } from "@tiptap/core";
import { parse } from "@rocket.chat/message-parser";
import { createComposerEditor } from "../editor/composer-editor";
import { pmToAst } from "../lib/pm-to-ast";
import { astToDoc } from "../lib/ast-to-doc";
import { serialize } from "../lib/serialize";

export interface ComposerEditorProps {
  /**
   * Raw Rocket.Chat markup to hydrate. Hydration happens once on mount —
   * remount (change the `key`) to reload a different draft or to re-import
   * the markup after editing it in the source view.
   */
  initialMarkup: string;
  /**
   * Receives the serialised markup of the current document after every
   * editor transaction — this is what gets sent on Send.
   */
  onMarkup: (markup: string) => void;
  /** Status line when a file drop is rejected. */
  onRejectFiles?: (note: string) => void;
}

/**
 * The WYSIWYG editing surface. Wraps the plain factory in a React container
 * and converts between markup and TipTap docs via the round-trippable
 * `astToDoc` / `pmToAst` / `serialize` pair, so the editor is the single
 * source of truth while its text remains a faithful Rocket.Chat message.
 */
export function ComposerEditor(props: ComposerEditorProps) {
  const holderRef = useRef<HTMLDivElement>(null);
  const [editor, setEditor] = useState<Editor | null>(null);
  const [linkMode, setLinkMode] = useState(false);
  const [linkHref, setLinkHref] = useState("");
  const onMarkup = props.onMarkup;
  const onReject = props.onRejectFiles;
  // Callbacks the factory captures long-term, kept current via effects
  // (refs are only written inside effects, per react-hooks/refs).
  const onMarkupRef = useRef(onMarkup);
  const onRejectRef = useRef(onReject);
  useEffect(() => {
    onMarkupRef.current = onMarkup;
    onRejectRef.current = onReject;
  });

  useEffect(() => {
    const element = holderRef.current;
    if (!element) {
      return;
    }
    const ast = parse(props.initialMarkup, { emoticons: true, colors: true });
    const ed = createComposerEditor({
      element,
      initialContent: astToDoc(ast),
      onUpdate: (json) => onMarkupRef.current(serialize(pmToAst(json))),
      onRejectDrop: (note) => onRejectRef.current?.(note),
    });
    // Flush the hydrated content to the parent immediately (the factory's
    // onUpdate only fires on later transactions).
    onMarkupRef.current(serialize(pmToAst(ed.state.doc.toJSON() as never)));
    setEditor(ed);
    return () => {
      ed.destroy();
      setEditor(null);
      setLinkMode(false);
    };
    // The editor is created exactly once per mount; the component is keyed
    // by the caller for every rehydration.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const cmd = (fn: (ed: Editor) => boolean) => () => {
    if (editor) {
      fn(editor);
    }
  };

  const applyLink = () => {
    if (!editor) {
      return;
    }
    const href = linkHref.trim();
    if (href.length > 0) {
      editor.chain().focus().extendMarkRange("link").setLink({ href }).run();
    } else {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
    }
    setLinkMode(false);
    setLinkHref("");
  };

  return (
    <>
      <div className="composer-toolbar" role="toolbar" aria-label="Formatting">
        <button
          type="button"
          className="tb-btn"
          title="Bold (⌘B)"
          onClick={cmd((ed) => (ed.chain().focus().toggleBold().run(), true))}
        >
          <strong>B</strong>
        </button>
        <button
          type="button"
          className="tb-btn"
          title="Italic (⌘I)"
          onClick={cmd((ed) => (ed.chain().focus().toggleItalic().run(), true))}
        >
          <em>I</em>
        </button>
        <button
          type="button"
          className="tb-btn"
          title="Strikethrough"
          onClick={cmd((ed) => (ed.chain().focus().toggleStrike().run(), true))}
        >
          <s>S</s>
        </button>
        <button
          type="button"
          className="tb-btn mono"
          title="Inline code"
          onClick={cmd((ed) => (ed.chain().focus().toggleCode().run(), true))}
        >
          {"</>"}
        </button>
        <button
          type="button"
          className="tb-btn"
          title="Quote"
          onClick={cmd((ed) => (ed.chain().focus().toggleBlockquote().run(), true))}
        >
          “”
        </button>
        <button
          type="button"
          className="tb-btn"
          title="Bullet list"
          onClick={cmd((ed) => (ed.chain().focus().toggleBulletList().run(), true))}
        >
          •
        </button>
        <button
          type="button"
          className="tb-btn"
          title="Numbered list"
          onClick={cmd((ed) => (ed.chain().focus().toggleOrderedList().run(), true))}
        >
          1.
        </button>
        <button
          type="button"
          className="tb-btn"
          title="Task list"
          onClick={cmd((ed) => (ed.chain().focus().toggleTaskList().run(), true))}
        >
          ☑
        </button>
        <button
          type="button"
          className="tb-btn mono"
          title="Code block"
          onClick={cmd((ed) => (ed.chain().focus().toggleCodeBlock().run(), true))}
        >
          {"</>"}
        </button>
        <select
          className="tb-select"
          aria-label="Heading level"
          defaultValue=""
          onChange={(e) => {
            const level = Number(e.target.value);
            if (level >= 1 && level <= 4 && editor) {
              editor
                .chain()
                .focus()
                .setHeading({ level: level as 1 | 2 | 3 | 4 })
                .run();
            }
            e.currentTarget.value = "";
          }}
        >
          <option value="" disabled>
            Heading
          </option>
          {[1, 2, 3, 4].map((lvl) => (
            <option key={lvl} value={lvl}>
              H{lvl}
            </option>
          ))}
        </select>
        <button
          type="button"
          className="tb-btn"
          title="Link"
          aria-pressed={linkMode}
          onClick={() => {
            if (!editor) {
              return;
            }
            setLinkHref(
              (editor.getAttributes("link") as { href?: string })?.href ?? ""
            );
            setLinkMode((was) => !was);
          }}
        >
          🕸
        </button>
      </div>
      {linkMode ? (
        <div className="composer-linkbar">
          <input
            type="url"
            placeholder="https://"
            aria-label="Link destination"
            value={linkHref}
            onChange={(e) => setLinkHref(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                applyLink();
              }
              if (e.key === "Escape") {
                e.preventDefault();
                setLinkMode(false);
              }
            }}
          />
          <button type="button" className="btn ghost" onClick={applyLink}>
            Apply
          </button>
          <button
            type="button"
            className="btn ghost"
            onClick={() => setLinkMode(false)}
          >
            Cancel
          </button>
        </div>
      ) : null}
      <div
        className="composer-tiptap"
        onKeyDown={(e) => {
          // ⌘/Ctrl+Enter sends the draft; Escape dismisses the link bar.
          if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
            e.preventDefault();
            window.dispatchEvent(new CustomEvent("composer:send-request"));
          }
          if (e.key === "Escape" && linkMode) {
            e.preventDefault();
            setLinkMode(false);
          }
        }}
      >
        <div ref={holderRef} className="composer-tiptap-host" />
      </div>
    </>
  );
}
