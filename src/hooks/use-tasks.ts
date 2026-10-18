"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api, getErrorMessage } from "@/lib/api-client";
import type { DownloadTask, TaskAction } from "@/lib/types";

export interface UseTasksResult {
  /** 任务列表，按创建时间倒序 */
  tasks: DownloadTask[];
  loading: boolean;
  error: string | null;
  /** SSE 是否已连接（断开时浏览器会自动重连） */
  connected: boolean;
  refresh: () => Promise<void>;
  /** 执行暂停/继续/取消/重试/删除，并同步本地任务状态 */
  runAction: (id: string, action: TaskAction) => Promise<DownloadTask | null>;
}

function sortTasks(tasks: DownloadTask[]): DownloadTask[] {
  return tasks.slice().sort((a, b) => b.createdAt - a.createdAt);
}

function upsertTask(tasks: DownloadTask[], task: DownloadTask): DownloadTask[] {
  const next = tasks.filter((item) => item.id !== task.id);
  next.push(task);
  return sortTasks(next);
}

function isDownloadTask(value: unknown): value is DownloadTask {
  if (!value || typeof value !== "object") return false;
  const task = value as Partial<DownloadTask>;
  return typeof task.id === "string" && typeof task.status === "string";
}

/**
 * 兼容两种 SSE 负载：{ type: "task-updated", task } 包装形式，
 * 或 event: task-updated + data: task 的裸负载形式。
 */
function applyTaskEvent(previous: DownloadTask[], payload: unknown, eventName?: string): DownloadTask[] {
  if (!payload || typeof payload !== "object") return previous;
  const record = payload as { type?: unknown; tasks?: unknown; task?: unknown; id?: unknown };
  const type = typeof record.type === "string" ? record.type : eventName;

  if (type === "init") {
    const list = Array.isArray(payload) ? payload : record.tasks;
    if (Array.isArray(list)) return sortTasks(list.filter(isDownloadTask));
    return previous;
  }

  if (type === "task-updated") {
    const candidate = record.task ?? payload;
    if (isDownloadTask(candidate)) return upsertTask(previous, candidate);
    return previous;
  }

  if (type === "task-deleted") {
    let id: string | null = typeof record.id === "string" ? record.id : null;
    if (!id && isDownloadTask(record.task)) id = record.task.id;
    if (id) return previous.filter((item) => item.id !== id);
    return previous;
  }

  return previous;
}

export function useTasks(): UseTasksResult {
  const [tasks, setTasks] = useState<DownloadTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const mountedRef = useRef(true);

  const refresh = useCallback(async () => {
    try {
      const data = await api.tasks.list();
      if (!mountedRef.current) return;
      setTasks(sortTasks(data.tasks));
      setError(null);
    } catch (cause) {
      if (!mountedRef.current) return;
      setError(getErrorMessage(cause));
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;

    api.tasks
      .list()
      .then((data) => {
        if (!mountedRef.current) return;
        setTasks(sortTasks(data.tasks));
        setError(null);
      })
      .catch((cause: unknown) => {
        if (!mountedRef.current) return;
        setError(getErrorMessage(cause));
      })
      .finally(() => {
        if (mountedRef.current) setLoading(false);
      });

    let source: EventSource | null = null;
    try {
      source = new EventSource(api.tasks.eventsUrl);
    } catch {
      source = null;
    }

    if (source) {
      const handle = (payload: unknown, eventName?: string) => {
        if (!mountedRef.current) return;
        setTasks((previous) => applyTaskEvent(previous, payload, eventName));
      };

      source.onopen = () => {
        if (mountedRef.current) setConnected(true);
      };
      source.onmessage = (event) => {
        try {
          handle(JSON.parse(event.data));
        } catch {
          /* 忽略无法解析的心跳/负载 */
        }
      };
      source.onerror = () => {
        if (mountedRef.current) setConnected(false);
      };

      const namedEvents = ["init", "task-updated", "task-deleted"] as const;
      namedEvents.forEach((name) => {
        source?.addEventListener(name, (event) => {
          const message = event as MessageEvent<string>;
          try {
            handle(JSON.parse(message.data), name);
          } catch {
            /* 忽略无法解析的负载 */
          }
        });
      });
    }

    return () => {
      mountedRef.current = false;
      source?.close();
    };
  }, []);

  const runAction = useCallback(async (id: string, action: TaskAction): Promise<DownloadTask | null> => {
    const data = await api.tasks.action(id, action);
    if (action === "delete") {
      setTasks((previous) => previous.filter((item) => item.id !== id));
    } else if (data.task) {
      setTasks((previous) => upsertTask(previous, data.task));
    }
    return data.task ?? null;
  }, []);

  return { tasks, loading, error, connected, refresh, runAction };
}
