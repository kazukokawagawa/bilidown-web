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
        className="group"
        disabled={page <= 1 || loading}
        onClick={() => onPageChange(page - 1)}
      >
        <ChevronLeft className="h-4 w-4 transition-transform duration-200 group-hover:-translate-x-0.5" />
        上一页
      </Button>
      <span className="text-sm text-muted-foreground">第 {page} 页</span>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="group"
        disabled={!hasMore || loading}
        onClick={() => onPageChange(page + 1)}
      >
        下一页
        <ChevronRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5" />
      </Button>
    </div>
  );
}
