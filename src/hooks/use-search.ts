"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { api, getErrorMessage } from "@/lib/api-client";
import type { SearchItem, SearchResponse } from "@/lib/types";

export type SearchType = "video" | "user";
export type SearchOrder = "totalrank" | "click" | "pubdate" | "dm";

export const SEARCH_ORDERS: { value: SearchOrder; label: string }[] = [
  { value: "totalrank", label: "综合排序" },
  { value: "click", label: "最多播放" },
  { value: "pubdate", label: "最新发布" },
  { value: "dm", label: "最多弹幕" },
];

export interface UseSearchResult {
  keyword: string;
  type: SearchType;
  order: SearchOrder;
  page: number;
  items: SearchItem[];
  total: number;
  hasMore: boolean;
  loading: boolean;
  error: string | null;
  submit: (keyword: string) => void;
  setType: (type: SearchType) => void;
  setOrder: (order: SearchOrder) => void;
  setPage: (page: number) => void;
  retry: () => void;
}

interface SearchState {
  key: string;
  data: SearchResponse | null;
  error: string | null;
}

function isSearchOrder(value: string | null): value is SearchOrder {
  return value === "totalrank" || value === "click" || value === "pubdate" || value === "dm";
}

function parsePage(value: string | null): number {
  const page = Number(value);
  if (!Number.isFinite(page) || page < 1) return 1;
  return Math.floor(page);
}

/**
 * 搜索页数据与 URL 状态（?keyword=&type=&page=&order=）。
 * URL 是唯一数据源：任何筛选变化都通过 router.replace 写回地址栏。
 * loading 由「当前请求 key 是否已有结果」派生，避免在 effect 中同步 setState。
 */
export function useSearch(): UseSearchResult {
  const router = useRouter();
  const searchParams = useSearchParams();

  const keyword = (searchParams.get("keyword") ?? "").trim();
  const type: SearchType = searchParams.get("type") === "user" ? "user" : "video";
  const rawOrder = searchParams.get("order");
  const order: SearchOrder = isSearchOrder(rawOrder) ? rawOrder : "totalrank";
  const page = parsePage(searchParams.get("page"));

  const [reloadToken, setReloadToken] = useState(0);
  const [state, setState] = useState<SearchState | null>(null);
  const requestKey = keyword + "|" + type + "|" + order + "|" + page + "|" + reloadToken;

  useEffect(() => {
    if (!keyword) return;
    let cancelled = false;
    const sessionKey = requestKey;

    api.bili
      .search({ keyword, type, page, order })
      .then((response) => {
        if (cancelled) return;
        setState({ key: sessionKey, data: response, error: null });
      })
      .catch((cause) => {
        if (cancelled) return;
        const message = getErrorMessage(cause);
        setState({ key: sessionKey, data: null, error: message });
        toast.error("搜索失败：" + message);
      });

    return () => {
      cancelled = true;
    };
  }, [keyword, type, page, order, requestKey]);

  const current = state && state.key === requestKey ? state : null;
  const loading = keyword !== "" && current === null;
  const data = keyword ? (current?.data ?? null) : null;
  const error = keyword ? (current?.error ?? null) : null;

  const updateQuery = useCallback(
    (patch: { keyword?: string; type?: SearchType; order?: SearchOrder; page?: number }) => {
      const params = new URLSearchParams(searchParams.toString());
      const currentOrder = params.get("order");
      const currentType: SearchType = params.get("type") === "user" ? "user" : "video";
      const nextKeyword = (patch.keyword ?? params.get("keyword") ?? "").trim();
      const nextType = patch.type ?? currentType;
      const nextOrder = patch.order ?? (isSearchOrder(currentOrder) ? currentOrder : "totalrank");
      const nextPage = patch.page ?? parsePage(params.get("page"));

      if (nextKeyword) params.set("keyword", nextKeyword);
      else params.delete("keyword");
      params.set("type", nextType);
      params.set("order", nextOrder);
      if (nextPage > 1) params.set("page", String(nextPage));
      else params.delete("page");

      const nextQuery = params.toString();
      if (nextQuery === searchParams.toString()) return;
      router.replace(nextQuery ? "/search?" + nextQuery : "/search", { scroll: false });
    },
    [router, searchParams],
  );

  const submit = useCallback((value: string) => updateQuery({ keyword: value, page: 1 }), [updateQuery]);
  const setType = useCallback((value: SearchType) => updateQuery({ type: value, page: 1 }), [updateQuery]);
  const setOrder = useCallback((value: SearchOrder) => updateQuery({ order: value, page: 1 }), [updateQuery]);
  const setPage = useCallback((value: number) => updateQuery({ page: Math.max(1, value) }), [updateQuery]);
  const retry = useCallback(() => setReloadToken((token) => token + 1), []);

  return {
    keyword,
    type,
    order,
    page,
    items: data?.items ?? [],
    total: data?.total ?? 0,
    hasMore: data?.hasMore ?? false,
    loading,
    error,
    submit,
    setType,
    setOrder,
    setPage,
    retry,
  };
}
