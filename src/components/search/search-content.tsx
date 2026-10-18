"use client";

import { Search, SearchX } from "lucide-react";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { SEARCH_ORDERS, useSearch } from "@/hooks/use-search";
import { formatCount } from "@/lib/format";
import type { SearchUserItem, SearchVideoItem } from "@/lib/types";
import { SearchBar } from "./search-bar";
import { SearchPagination } from "./search-pagination";
import { UserResultCard } from "./user-result-card";
import { VideoResultCard } from "./video-result-card";

function SearchResultSkeleton() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: 6 }).map((_, index) => (
        <div key={index} className="space-y-2 rounded-xl border p-3">
          <Skeleton className="aspect-video w-full rounded-lg" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-2/3" />
        </div>
      ))}
    </div>
  );
}

export function SearchContent() {
  const {
    keyword,
    type,
    order,
    page,
    items,
    total,
    hasMore,
    loading,
    error,
    submit,
    setType,
    setOrder,
    setPage,
    retry,
  } = useSearch();

  const videoItems = items.filter((item): item is SearchVideoItem => item.type === "video");
  const userItems = items.filter((item): item is SearchUserItem => item.type === "user");
  const resultCount = type === "video" ? videoItems.length : userItems.length;

  function handleTypeChange(value: string) {
    setType(value === "user" ? "user" : "video");
  }

  function handleOrderChange(value: string) {
    const next = SEARCH_ORDERS.find((item) => item.value === value);
    if (next) setOrder(next.value);
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 sm:p-6">
      <PageHeader
        title="搜索"
        description="关键词搜索为增强功能（原桌面版仅支持链接解析）；若搜索接口不可用，可直接在首页粘贴视频链接解析下载。"
      />

      <Card>
        <CardContent className="space-y-4 p-4 sm:p-5">
          <SearchBar defaultValue={keyword} loading={loading} onSubmit={submit} />
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <Tabs value={type} onValueChange={handleTypeChange}>
              <TabsList>
                <TabsTrigger value="video">视频</TabsTrigger>
                <TabsTrigger value="user">UP主</TabsTrigger>
              </TabsList>
            </Tabs>
            {type === "video" ? (
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">排序</span>
                <Select value={order} onValueChange={handleOrderChange}>
                  <SelectTrigger className="h-9 w-32" aria-label="排序方式">
                    <SelectValue placeholder="排序" />
                  </SelectTrigger>
                  <SelectContent>
                    {SEARCH_ORDERS.map((item) => (
                      <SelectItem key={item.value} value={item.value}>
                        {item.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : null}
          </div>
        </CardContent>
      </Card>

      {!keyword ? (
        <EmptyState
          icon={Search}
          title="搜索 B 站视频与 UP 主"
          description="输入关键词后回车或点击搜索按钮；也可以直接点击顶部的搜索框。"
          className="py-16"
        />
      ) : loading ? (
        <SearchResultSkeleton />
      ) : error ? (
        <EmptyState
          icon={SearchX}
          title="搜索接口暂不可用"
          description={
            (error || "关键词搜索依赖 B 站搜索接口，可能因 WBI 校验失败暂时不可用。") +
            " 你仍可以在首页粘贴视频链接解析下载。"
          }
          action={
            <Button variant="outline" onClick={retry}>
              重试
            </Button>
          }
        />
      ) : resultCount === 0 ? (
        <EmptyState
          icon={SearchX}
          title={"没有找到与「" + keyword + "」相关的内容"}
          description="换个关键词，或切换视频 / UP主 分类再试试。"
        />
      ) : (
        <section className="space-y-4">
          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <span>{total > 0 ? "共 " + formatCount(total) + " 个结果" : "搜索结果"}</span>
            <span>第 {page} 页</span>
          </div>

          {type === "video" ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {videoItems.map((item) => (
                <VideoResultCard key={item.bvid} item={item} />
              ))}
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              {userItems.map((item) => (
                <UserResultCard key={item.mid} item={item} />
              ))}
            </div>
          )}

          <SearchPagination page={page} hasMore={hasMore} loading={loading} onPageChange={setPage} />
        </section>
      )}
    </div>
  );
}
