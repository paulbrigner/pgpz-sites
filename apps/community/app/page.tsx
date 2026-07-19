import dynamicImport from "next/dynamic";
import { Suspense } from "react";
import { HomeShellSkeleton } from "@/components/home/Skeletons";
import { loadFeaturedPolicyUpdates } from "@/lib/homepage-policy-updates";

const HomeClient = dynamicImport(() => import("./home-client"), {
  loading: () => <HomeShellSkeleton />,
});

export const revalidate = 300;

export default async function HomePage() {
  const featuredPolicyUpdates = await loadFeaturedPolicyUpdates();
  return (
    <Suspense fallback={<HomeShellSkeleton />}>
      <HomeClient featuredPolicyUpdates={featuredPolicyUpdates} />
    </Suspense>
  );
}
