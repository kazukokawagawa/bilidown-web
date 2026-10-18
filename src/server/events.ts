import type { TaskEvent } from "@/lib/types";

/** 进程内任务事件总线（SSE 订阅用），挂到 globalThis 避免 dev 热更新丢订阅。 */

type TaskEventListener = (event: TaskEvent) => void;

interface EventBusState {
  listeners: Set<TaskEventListener>;
}

const globalScope = globalThis as unknown as { __bilidownEventBus?: EventBusState };
const state: EventBusState = (globalScope.__bilidownEventBus ??= { listeners: new Set<TaskEventListener>() });

export function subscribeTaskEvents(listener: TaskEventListener): () => void {
  state.listeners.add(listener);
  return () => {
    state.listeners.delete(listener);
  };
}

export function publishTaskEvent(event: TaskEvent): void {
  for (const listener of [...state.listeners]) {
    try {
      listener(event);
    } catch (error) {
      console.error("[events] 订阅者处理事件失败:", error);
    }
  }
}

export function taskEventSubscriberCount(): number {
  return state.listeners.size;
}
