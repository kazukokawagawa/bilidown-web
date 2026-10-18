"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";

interface SearchPaginationProps {
  page: number;
  hasMore: boolean;
  loading?: boolean;
  onPageChange: (page: number) => void;
}

export function SearchPagination({ page, hasMore, loading, onPageChange }: SearchPaginationProps) {
  return (
    <div className="flex items-center justify-center gap-3">
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={page <= 1 || loading}
        onClick={() => onPageChange(page - 1)}
      >
        <ChevronLeft className="h-4 w-4" />
        上一页
      </Button>
      <span className="text-sm text-muted-foreground">第 {page} 页</span>
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={!hasMore || loading}
        onClick={() => onPageChange(page + 1)}
      >
        下一页
        <ChevronRight className="h-4 w-4" />
      </Button>
    </div>
  );
}
