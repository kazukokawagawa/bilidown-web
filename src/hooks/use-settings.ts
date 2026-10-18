"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api, getErrorMessage } from "@/lib/api-client";
import type { AppSettings, PublicSettings, SystemInfo } from "@/lib/types";

export interface UseSettingsResult {
  settings: PublicSettings | null;
  loading: boolean;
  error: string | null;
  saving: boolean;
  reload: () => Promise<void>;
  save: (patch: Partial<AppSettings>) => Promise<PublicSettings | null>;
}

export function useSettings(): UseSettingsResult {
  const [settings, setSettings] = useState<PublicSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const mountedRef = useRef(true);

  const reload = useCallback(async () => {
    try {
      const data = await api.settings.get();
      if (!mountedRef.current) return;
      setSettings(data.settings);
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
    let cancelled = false;

    async function load() {
      try {
        const data = await api.settings.get();
        if (cancelled) return;
        setSettings(data.settings);
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

  const save = useCallback(async (patch: Partial<AppSettings>): Promise<PublicSettings | null> => {
    setSaving(true);
    try {
      const data = await api.settings.update(patch);
      if (mountedRef.current) {
        setSettings(data.settings);
        setError(null);
      }
      return data.settings;
    } finally {
      if (mountedRef.current) setSaving(false);
    }
  }, []);

  return { settings, loading, error, saving, reload, save };
}

export interface UseSystemInfoResult {
  info: SystemInfo | null;
  loading: boolean;
  error: string | null;
  reload: () => Promise<void>;
}

export function useSystemInfo(): UseSystemInfoResult {
  const [info, setInfo] = useState<SystemInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(true);

  const reload = useCallback(async () => {
    try {
      const data = await api.system.info();
      if (!mountedRef.current) return;
      setInfo(data);
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
    let cancelled = false;

    async function load() {
      try {
        const data = await api.system.info();
        if (cancelled) return;
        setInfo(data);
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

  return { info, loading, error, reload };
}
