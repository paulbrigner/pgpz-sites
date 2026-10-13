import dynamicImport from "next/dynamic";
import { Suspense } from "react";
import { HomeShellSkeleton } from "@/components/home/Skeletons";

const HomeClient = dynamicImport(() => import("./home-client"), {
  loading: () => <HomeShellSkeleton />,
});

// Membership and onboarding are resolved by the Community client.
export const dynamic = "force-dynamic";

export default async function HomePage() {
  return (
    <Suspense fallback={<HomeShellSkeleton />}>
      <HomeClient />
    </Suspense>
  );
}
