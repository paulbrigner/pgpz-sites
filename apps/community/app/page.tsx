import dynamic from "next/dynamic";
import { Suspense } from "react";
import { HomeShellSkeleton } from "@/components/home/Skeletons";

const HomeClient = dynamic(() => import("./home-client"), {
  loading: () => <HomeShellSkeleton />,
});

export default function HomePage() {
  return (
    <Suspense fallback={<HomeShellSkeleton />}>
      <HomeClient />
    </Suspense>
  );
}
