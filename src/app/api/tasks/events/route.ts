import { getTaskManager } from "@/server/download/manager";
import { subscribeTaskEvents } from "@/server/events";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const HEARTBEAT_INTERVAL_MS = 25000;

/**
 * GET /api/tasks/events — SSE 任务事件流。
 * 事件：{ type: "init", tasks } / { type: "task-updated", task } / { type: "task-deleted", id }
 * 25s 发送一次注释心跳，保持连接。
 */
export async function GET(request: Request): Promise<Response> {
  const tasks = await getTaskManager().list();
  const encoder = new TextEncoder();
  let cleanup = () => undefined as void;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false;
      const send = (text: string) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(text));
        } catch {
          closed = true;
        }
      };

      const unsubscribe = subscribeTaskEvents((event) => {
        send("data: " + JSON.stringify(event) + "\n\n");
      });
      const heartbeat = setInterval(() => send(": ping\n\n"), HEARTBEAT_INTERVAL_MS);
      const onAbort = () => {
        cleanup();
        try {
          controller.close();
        } catch {
          // 已关闭
        }
      };
      request.signal.addEventListener("abort", onAbort, { once: true });

      cleanup = () => {
        if (closed) return;
        closed = true;
        clearInterval(heartbeat);
        unsubscribe();
        request.signal.removeEventListener("abort", onAbort);
      };

      send("data: " + JSON.stringify({ type: "init", tasks }) + "\n\n");
    },
    cancel() {
      cleanup();
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
