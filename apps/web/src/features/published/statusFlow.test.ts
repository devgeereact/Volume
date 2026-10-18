import { describe, expect, it, vi } from "vitest";
import type { ToastInput } from "../../lib/toast";
import { archiveWithUndo } from "./statusFlow";

function setup(archive: () => Promise<unknown> = () => Promise.resolve()) {
  const toasts: ToastInput[] = [];
  const restore = vi.fn(() => Promise.resolve());
  const flow = { title: "Quiet Hours", archive, restore, show: (t: ToastInput) => toasts.push(t), errorText: () => "Server said no." };
  return { toasts, restore, flow };
}

describe("archiveWithUndo", () => {
  it("shows an Undo toast after archiving, and Undo restores the book", async () => {
    const { toasts, restore, flow } = setup();
    await archiveWithUndo(flow);
    expect(toasts[0]?.title).toBe("Quiet Hours archived");
    expect(toasts[0]?.action?.label).toBe("Undo");
    toasts[0]?.action?.onClick();
    expect(restore).toHaveBeenCalledTimes(1);
    await vi.waitFor(() => expect(toasts[1]?.title).toBe("Quiet Hours restored"));
  });

  it("shows no toast and rejects when the archive fails", async () => {
    const { toasts, flow } = setup(() => Promise.reject(new Error("409")));
    await expect(archiveWithUndo(flow)).rejects.toThrow("409");
    expect(toasts).toHaveLength(0);
  });

  it("reports a failed Undo in an error toast", async () => {
    const { toasts, flow } = setup();
    flow.restore.mockImplementation(() => Promise.reject(new Error("down")));
    await archiveWithUndo(flow);
    toasts[0]?.action?.onClick();
    await vi.waitFor(() => expect(toasts[1]).toMatchObject({ tone: "error", body: "Server said no." }));
  });
});
