"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { notifyAccountChanged } from "@/lib/account-events";
import { api, getErrorMessage } from "@/lib/api-client";
import type { BiliUser } from "@/lib/types";

export interface UseAccountResult {
  user: BiliUser | null;
  loggedIn: boolean;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  logout: () => Promise<void>;
}

export function useAccount(): UseAccountResult {
  const [user, setUser] = useState<BiliUser | null>(null);
  const [loggedIn, setLoggedIn] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(true);

  const refresh = useCallback(async () => {
    try {
      const nav = await api.bili.nav();
      if (!mountedRef.current) return;
      setLoggedIn(nav.isLogin);
      setUser(nav.isLogin && nav.user ? nav.user : null);
      setError(null);
      notifyAccountChanged();
    } catch (cause) {
      if (!mountedRef.current) return;
      setError(getErrorMessage(cause));
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    let cancelled = false;

    async function load() {
      try {
        const nav = await api.bili.nav();
        if (cancelled) return;
        setLoggedIn(nav.isLogin);
        setUser(nav.isLogin && nav.user ? nav.user : null);
        setError(null);
      } catch (cause) {
        if (cancelled) return;
        setError(getErrorMessage(cause));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
      mountedRef.current = false;
    };
  }, []);

  const logout = useCallback(async () => {
    await api.bili.logout();
    if (!mountedRef.current) return;
    setUser(null);
    setLoggedIn(false);
    notifyAccountChanged();
  }, []);

  return { user, loggedIn, loading, error, refresh, logout };
}

export type QrLoginStatus = "idle" | "loading" | "waiting" | "scanned" | "expired" | "confirmed" | "error";

export interface UseQrLoginResult {
  status: QrLoginStatus;
  /** data:image/png;base64,... 形式的二维码图片 */
  image: string | null;
  message: string | null;
  /** 重新生成二维码（过期或出错后） */
  refresh: () => void;
}

const QR_POLL_INTERVAL = 1000;
const QR_TIMEOUT = 200000;
const QR_POLL_MAX_RETRIES = 2;

/** 打开扫码登录弹窗时生成二维码并每 1s 轮询，180s 超时。关闭弹窗（active=false）时自动停止。 */
export function useQrLogin(active: boolean, onConfirmed: (user?: BiliUser) => void): UseQrLoginResult {
  const [status, setStatus] = useState<QrLoginStatus>("idle");
  const [image, setImage] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [generation, setGeneration] = useState(0);
  const confirmedRef = useRef(onConfirmed);

  useEffect(() => {
    confirmedRef.current = onConfirmed;
  }, [onConfirmed]);

  const refresh = useCallback(() => {
    setGeneration((value) => value + 1);
  }, []);

  useEffect(() => {
    if (!active) return;

    let cancelled = false;
    let timer: number | null = null;

    const poll = async (key: string, deadline: number, failures = 0): Promise<void> => {
      if (cancelled) return;
      if (Date.now() > deadline) {
        setStatus("expired");
        setMessage("二维码已过期，请刷新后重新扫码");
        return;
      }

      try {
        const result = await api.bili.pollLogin(key);
        if (cancelled) return;

        if (result.status === "confirmed") {
          setStatus("confirmed");
          setMessage("登录成功");
          confirmedRef.current(result.user);
          return;
        }
        if (result.status === "expired") {
          setStatus("expired");
          setMessage(result.message ?? "二维码已过期，请刷新后重新扫码");
          return;
        }

        setStatus(result.status);
        setMessage(result.status === "scanned" ? "已扫码，请在手机上确认登录" : null);
      } catch (cause) {
        if (cancelled) return;
        // 网络/接口偶发失败时先重试，避免一次抖动就中断登录轮询。
        if (failures < QR_POLL_MAX_RETRIES && Date.now() < deadline) {
          timer = window.setTimeout(() => {
            void poll(key, deadline, failures + 1);
          }, QR_POLL_INTERVAL * 2);
          return;
        }
        setStatus("error");
        setMessage(getErrorMessage(cause));
        return;
      }

      timer = window.setTimeout(() => {
        void poll(key, deadline, 0);
      }, QR_POLL_INTERVAL);
    };

    void (async () => {
      setStatus("loading");
      setImage(null);
      setMessage(null);
      try {
        const qr = await api.bili.qrcode();
        if (cancelled) return;
        setImage(qr.image);
        setStatus("waiting");
        const deadline = Date.now() + QR_TIMEOUT;
        timer = window.setTimeout(() => {
          void poll(qr.key, deadline);
        }, QR_POLL_INTERVAL);
      } catch (cause) {
        if (cancelled) return;
        setStatus("error");
        setMessage(getErrorMessage(cause));
      }
    })();

    return () => {
      cancelled = true;
      if (timer !== null) window.clearTimeout(timer);
    };
  }, [active, generation]);

  return { status, image, message, refresh };
}
