"use client";

import { Suspense } from "react";
import { HomeContent } from "@/components/home/home-content";
import { PageSkeleton } from "@/components/shared/loading";

export default function HomePage() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto max-w-6xl p-4 sm:p-6">
          <PageSkeleton />
        </div>
      }
    >
      <HomeContent />
    </Suspense>
  );
}
