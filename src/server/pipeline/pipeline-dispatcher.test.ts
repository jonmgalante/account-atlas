import { afterEach, describe, expect, it, vi } from "vitest";

import { createPipelineDispatcher } from "@/server/pipeline/pipeline-dispatcher";

const originalVercel = process.env.VERCEL;

afterEach(() => {
  if (originalVercel === undefined) {
    delete process.env.VERCEL;
  } else {
    process.env.VERCEL = originalVercel;
  }
});

describe("createPipelineDispatcher", () => {
  it("runs inline by default outside Vercel", async () => {
    delete process.env.VERCEL;
    const inlineRunner = vi.fn(async () => {});
    const queueSender = vi.fn();
    const dispatcher = createPipelineDispatcher({
      inlineRunner,
      queueSender,
    });

    const result = await dispatcher.dispatch({ runId: 11 });

    expect(result.executionMode).toBe("inline");
    expect(inlineRunner).toHaveBeenCalledWith(11);
    expect(queueSender).not.toHaveBeenCalled();
  });

  it("uses Vercel Queues first when running on Vercel", async () => {
    process.env.VERCEL = "1";
    const inlineRunner = vi.fn(async () => {});
    const queueSender = vi.fn(async () => ({ messageId: "msg_123" }));
    const dispatcher = createPipelineDispatcher({
      inlineRunner,
      queueSender,
    });

    const result = await dispatcher.dispatch({ runId: 22 });

    expect(result.executionMode).toBe("vercel_queue");
    expect(result.queueMessageId).toBe("msg_123");
    expect(queueSender).toHaveBeenCalled();
    expect(inlineRunner).not.toHaveBeenCalled();
  });

  it("falls back to inline when queue publishing fails in auto mode", async () => {
    process.env.VERCEL = "1";
    const inlineRunner = vi.fn(async () => {});
    const queueSender = vi.fn(async () => {
      throw new Error("queue unavailable");
    });
    const dispatcher = createPipelineDispatcher({
      inlineRunner,
      queueSender,
    });

    const result = await dispatcher.dispatch({ runId: 33 });

    expect(result.executionMode).toBe("inline");
    expect(inlineRunner).toHaveBeenCalledWith(33);
  });
});
