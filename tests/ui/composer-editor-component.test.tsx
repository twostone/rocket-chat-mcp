/** @vitest-environment jsdom */
import { afterEach, describe, it, expect, vi } from "vitest";
import { render, screen, waitFor, fireEvent, cleanup } from "@testing-library/react";
import { ComposerEditor } from "../../ui/composer/src/components/ComposerEditor";

function titledButton(container: HTMLElement, title: string) {
  return container.querySelector(`[title="${title}"]`);
}

describe("ComposerEditor (React surface)", () => {
  afterEach(cleanup);
  it("hydrates markup into the editor and flushes it upward", async () => {
    const onMarkup = vi.fn();
    const { container } = render(
      <ComposerEditor initialMarkup=":fire: hello" onMarkup={onMarkup} />
    );

    // The ProseMirror view renders the glyph (shortcodes never reach the
    // surface) — wait for the effect-mounted editor.
    await waitFor(() => {
      const host = container.querySelector(".composer-tiptap-host");
      expect(host?.textContent).toContain("🔥");
    });
    expect(container.querySelector(".composer-tiptap-host")?.textContent)
      .toContain("hello");
    // A contenteditable must exist inside the host (the real editing
    // surface, not a plain div).
    expect(
      container.querySelector(".composer-tiptap-host [contenteditable]")
    ).toBeTruthy();

    // Mount-time flush: the parent learns the current markup before any
    // user transaction (the factory's onUpdate fires only on later edits).
    expect(onMarkup).toHaveBeenCalledTimes(1);
    expect(onMarkup.mock.calls[0]?.[0]).toBe(":fire: hello");
  });

  it("offers the v1 formatting toolbar", () => {
    const { container } = render(
      <ComposerEditor initialMarkup="hi" onMarkup={() => {}} />
    );
    for (const title of [
      "Bold (⌘B)",
      "Italic (⌘I)",
      "Strikethrough",
      "Inline code",
      "Code block",
      "Quote",
      "Bullet list",
      "Numbered list",
      "Task list",
      "Link",
    ]) {
      expect(titledButton(container, title)).toBeTruthy();
    }
    expect(
      container.querySelector('[aria-label="Heading level"]')
    ).toBeTruthy();
  });

  it("opens a link bar from the Link button", () => {
    const { container } = render(
      <ComposerEditor initialMarkup="some text" onMarkup={() => {}} />
    );
    expect(screen.queryByLabelText("Link destination")).toBeNull();
    fireEvent.click(titledButton(container, "Link") as Element);
    const input = screen.getByLabelText("Link destination");
    expect(input).toBeTruthy();
    // A non-empty URL can be entered; Apply accepts it.
    fireEvent.change(input, { target: { value: "https://example.com" } });
    fireEvent.click(screen.getByRole("button", { name: "Apply" }));
    expect(screen.queryByLabelText("Link destination")).toBeNull();
  });
});
