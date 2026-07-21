import dynamicImport from "next/dynamic";
import { Suspense } from "react";
import { HomeShellSkeleton } from "@/components/home/Skeletons";
import { loadFeaturedPolicyUpdates } from "@/lib/homepage-policy-updates";

const HomeClient = dynamicImport(() => import("./home-client"), {
  loading: () => <HomeShellSkeleton />,
});

// Resolve policy updates in the Amplify runtime, where the compute role can read
// DynamoDB. A static build has no application-data credentials and must not
// freeze the bundled fallback updates into the deployed homepage.
export const dynamic = "force-dynamic";

export default async function HomePage() {
  const featuredPolicyUpdates = await loadFeaturedPolicyUpdates();
  return (
    <Suspense fallback={<HomeShellSkeleton />}>
      <HomeClient featuredPolicyUpdates={featuredPolicyUpdates} />
    </Suspense>
  );
}
