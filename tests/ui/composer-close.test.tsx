/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import {
  render,
  screen,
  waitFor,
  fireEvent,
  act,
  cleanup,
} from "@testing-library/react";

vi.mock("@modelcontextprotocol/ext-apps/react", () => ({
  applyDocumentTheme: vi.fn(),
  applyHostFonts: vi.fn(),
  applyHostStyleVariables: vi.fn(),
  useApp: vi.fn(),
}));

import { useApp } from "@modelcontextprotocol/ext-apps/react";
import { App } from "../../ui/composer/src/App";

interface AppStub {
  callServerTool: ReturnType<typeof vi.fn>;
  updateModelContext: ReturnType<typeof vi.fn>;
  requestTeardown: ReturnType<typeof vi.fn>;
  getHostContext: ReturnType<typeof vi.fn>;
  openLink: ReturnType<typeof vi.fn>;
  onteardown: unknown;
  ontoolinput: unknown;
}

const stub: AppStub = {
  callServerTool: vi.fn(),
  updateModelContext: vi.fn(),
  requestTeardown: vi.fn(),
  getHostContext: vi.fn(),
  openLink: vi.fn(),
  onteardown: undefined,
  ontoolinput: undefined,
};

function renderApp() {
  useApp.mockImplementation((opts: { onAppCreated?: (a: AppStub) => void }) => {
    opts?.onAppCreated?.(stub);
    return { app: stub, isConnected: true, error: null } as never;
  });
  const utils = render(<App />);
  // Deliver a draft the same way the host would (the App registers its
  // handler on the app object in onAppCreated).
  const deliverDraft = (args: Record<string, unknown>) =>
    act(() => {
      (stub.ontoolinput as ((i: { arguments: unknown }) => void) | undefined)?.({
        arguments: args,
      });
    });
  return { ...utils, deliverDraft };
}

const DRAFT_ARGS = { roomName: "general", message: ":fire: hello" };

beforeEach(() => {
  vi.clearAllMocks();
  stub.callServerTool.mockReset().mockResolvedValue({
    content: [{ type: "text", text: "sent" }],
  });
  stub.updateModelContext.mockReset().mockResolvedValue(undefined);
  stub.requestTeardown.mockReset().mockResolvedValue(undefined);
  stub.onteardown = undefined;
  stub.ontoolinput = undefined;
});

afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});

describe("composer close-on-success contract (ratified seam 7)", () => {
  it("send: send-message → updateModelContext → requestTeardown, in order", async () => {
    const { deliverDraft } = renderApp();
    await waitFor(() => expect(stub.ontoolinput).toBeDefined());
    deliverDraft(DRAFT_ARGS);
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /^Send/ })).toBeDefined()
    );
    fireEvent.click(screen.getByRole("button", { name: /^Send/ }));
    await waitFor(() => expect(stub.callServerTool).toHaveBeenCalled());
    await waitFor(() => expect(stub.requestTeardown).toHaveBeenCalled());

    const sendIdx = stub.callServerTool.mock.invocationCallOrder?.[0];
    const ctxIdx = stub.updateModelContext.mock.invocationCallOrder?.[0];
    const tearIdx = stub.requestTeardown.mock.invocationCallOrder?.[0];
    expect(sendIdx).toBeDefined();
    expect(ctxIdx).toBeDefined();
    expect(tearIdx).toBeDefined();
    if (sendIdx === undefined || ctxIdx === undefined || tearIdx === undefined) {
      throw new Error("expected all three calls");
    }
    expect(sendIdx).toBeLessThan(ctxIdx);
    expect(ctxIdx).toBeLessThan(tearIdx);
  });

  it("registers a teardown acknowledgement that settles with an empty result", () => {
    renderApp();
    // Design: onteardown → {} so the host always sees a settled app.
    const ack = stub.onteardown;
    expect(ack).toBeInstanceOf(Function);
    expect((ack as () => unknown)()).toEqual({});
  });

  it("send FAILURE: no teardown, no success context — draft stays live", async () => {
    stub.callServerTool.mockReset().mockResolvedValueOnce({
      isError: true,
      content: [{ type: "text", text: "boom" }],
    });
    const { deliverDraft } = renderApp();
    await waitFor(() => expect(stub.ontoolinput).toBeDefined());
    deliverDraft(DRAFT_ARGS);
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /^Send/ })).toBeDefined()
    );
    fireEvent.click(screen.getByRole("button", { name: /^Send/ }));
    await waitFor(() => expect(stub.callServerTool).toHaveBeenCalled());
    await waitFor(() =>
      expect(screen.getByText(/boom/)).toBeDefined()
    );
    expect(stub.requestTeardown).not.toHaveBeenCalled();
    expect(stub.updateModelContext).not.toHaveBeenCalled();
  });

  it("discard: updateModelContext → requestTeardown, no send", async () => {
    const { deliverDraft } = renderApp();
    await waitFor(() => expect(stub.ontoolinput).toBeDefined());
    deliverDraft(DRAFT_ARGS);
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Discard" })).toBeDefined()
    );
    fireEvent.click(screen.getByRole("button", { name: "Discard" }));
    await waitFor(() => expect(stub.requestTeardown).toHaveBeenCalled());
    const ctxIdx = stub.updateModelContext.mock.invocationCallOrder?.[0];
    const tearIdx = stub.requestTeardown.mock.invocationCallOrder?.[0];
    expect(ctxIdx).toBeDefined();
    expect(tearIdx).toBeDefined();
    if (ctxIdx === undefined || tearIdx === undefined) {
      throw new Error("expected both calls");
    }
    expect(ctxIdx).toBeLessThan(tearIdx);
    expect(stub.callServerTool).not.toHaveBeenCalled();
  });
});
