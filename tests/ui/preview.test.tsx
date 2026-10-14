/** @vitest-environment jsdom */
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { Preview } from "../../ui/composer/src/components/Preview";
import { extractDraft } from "../../ui/composer/src/App";
import type { DraftPayload } from "../../ui/composer/src/types";

function payload(overrides?: Partial<DraftPayload>): DraftPayload {
  return {
    roomName: "general",
    room: { displayName: "general", kind: "channel" },
    sender: { username: "bot", name: "Bot", avatarUrl: null },
    message: "",
    ...overrides,
  };
}

describe("Preview (Rocket.Chat-style rendering)", () => {
  it("renders plain text in a paragraph", () => {
    const { container } = render(
      <Preview payload={payload({ message: "hello world" })} text="hello world" />
    );
    const paragraph = container.querySelector("p.md");
    expect(paragraph?.textContent).toBe("hello world");
  });

  it("renders bold, italic and strikethrough", () => {
    const { container } = render(<Preview payload={payload()} text="*b* _i_ ~s~" />);
    expect(container.querySelector("strong")?.textContent).toBe("b");
    expect(container.querySelector("em")?.textContent).toBe("i");
    expect(container.querySelector("s")?.textContent).toBe("s");
  });

  it("renders inline and fenced code", () => {
    const { container } = render(
      <Preview payload={payload()} text={"`x` and\n\n```\nline1\n```"} />
    );
    const inline = container.querySelector("code.inline-code");
    expect(inline?.textContent).toBe("x");
    expect(container.querySelector("pre")?.tagName).toBe("PRE");
    expect(container.querySelector("pre")?.textContent).toContain("line1");
  });

  it("renders headings", () => {
    const { container } = render(<Preview payload={payload()} text="# Title" />);
    const heading = container.querySelector("h1");
    expect(heading?.textContent).toBe("Title");
  });

  it("opens links through the host bridge instead of navigating", async () => {
    const onOpenLink = vi.fn();
    render(
      <Preview
        payload={payload()}
        text="<https://example.com|Example>"
        onOpenLink={onOpenLink}
      />
    );
    const link = screen.getByRole("link", { name: "Example" });
    expect(link.getAttribute("href")).toBe("https://example.com");
    fireEvent.click(link);
    expect(onOpenLink).toHaveBeenCalledWith("https://example.com");
  });

  it("renders user and channel mentions as highlighted chips", () => {
    const { container } = render(
      <Preview payload={payload()} text="hi @alice #town-square" />
    );
    const mentions = container.querySelectorAll(".mention");
    expect(Array.from(mentions).map((el) => el.textContent)).toEqual([
      "@alice",
      "#town-square",
    ]);
  });

  it("maps known emoji shortcodes to unicode and keeps unknown ones as text", () => {
    const { container } = render(
      <Preview payload={payload()} text="hi :fire: today" />
    );
    expect(container.textContent).toContain("🔥");
    expect(container.querySelector(".unknown-emoji")).toBeNull();
    const { container: unknownContainer } = render(
      <Preview payload={payload()} text="no :nope_nope: here" />
    );
    expect(
      unknownContainer.querySelector(".unknown-emoji")?.textContent
    ).toBe(":nope_nope:");
  });

  it("renders a lone emoji line as a big emoji", () => {
    const { container } = render(<Preview payload={payload()} text=":fire:" />);
    const big = container.querySelector(".big-emoji");
    expect(big?.textContent).toBe("🔥");
  });

  it("renders quotes and plain lists", () => {
    const { container } = render(
      <Preview
        payload={payload()}
        text={"> quoted\n- one\n- two"}
      />
    );
    expect(container.querySelector(".quote")?.textContent).toContain("quoted");
    const items = container.querySelectorAll(".md-list li");
    expect(items).toHaveLength(2);
    expect(items[1]?.textContent).toBe("two");
  });

  it("renders task lists with checkbox states", () => {
    const { container } = render(
      <Preview
        payload={payload()}
        text={"- [x] done\n- [ ] todo"}
      />
    );
    const checkboxes = container.querySelectorAll("input[type=checkbox]");
    expect(checkboxes).toHaveLength(2);
    expect((checkboxes[0] as HTMLInputElement).checked).toBe(true);
    expect((checkboxes[1] as HTMLInputElement).checked).toBe(false);
  });

  it("shows the sender name and an initials avatar when no avatar URL exists", () => {
    const { container } = render(
      <Preview
        payload={payload({ sender: { username: "bot", name: "Bot", avatarUrl: null } })}
        text="hi"
      />
    );
    expect(container.querySelector(".display-name")?.textContent).toBe("Bot");
    expect(container.querySelector(".avatar.fallback")?.textContent).toBe("B");
  });

  it("shows the thread parent context when replying", () => {
    const { container } = render(
      <Preview
        payload={payload({
          tmid: "p1",
          parent: {
            username: "alice",
            name: "Alice",
            avatarUrl: null,
            message: "the question",
          },
        })}
        text="the answer"
      />
    );
    expect(container.querySelector(".parent-context")?.textContent).toContain(
      "the question"
    );
    expect(container.textContent).toContain("the answer");
  });

  it("renders image markdown as a labelled stub, never an external fetch", () => {
    const { container } = render(
      <Preview payload={payload()} text={"![pic](https://evil.example/x.png)"} />
    );
    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector(".image-stub")?.textContent).toContain("pic");
  });
});

describe("extractDraft", () => {
  it("derives a payload from the structured tool result", () => {
    const draft = extractDraft({
      structuredContent: {
        roomName: "general",
        room: { displayName: "general", kind: "channel" },
        sender: { username: "bot", name: "Bot", avatarUrl: null },
        message: "hello",
      },
    });
    expect(draft?.roomName).toBe("general");
    expect(draft?.sender.username).toBe("bot");
    expect(draft?.message).toBe("hello");
  });

  it("falls back to a thin payload from raw tool-input arguments", () => {
    const draft = extractDraft({ roomName: "ops", message: "hi" });
    expect(draft?.roomName).toBe("ops");
    expect(draft?.room.displayName).toBe("ops");
    expect(draft?.sender.username).toBe("you");
  });

  it("returns null for unrelated payloads", () => {
    expect(extractDraft({ foo: "bar" })).toBeNull();
    expect(extractDraft(null)).toBeNull();
  });
});
