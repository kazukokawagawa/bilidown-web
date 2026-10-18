"use client";

import { Suspense } from "react";
import { SearchContent } from "@/components/search/search-content";
import { PageSkeleton } from "@/components/shared/loading";

export default function SearchPage() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto max-w-6xl p-4 sm:p-6">
          <PageSkeleton />
        </div>
      }
    >
      <SearchContent />
    </Suspense>
  );
}
