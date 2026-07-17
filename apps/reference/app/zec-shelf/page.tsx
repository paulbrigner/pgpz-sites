import type { Metadata } from "next";
import { ZecShelfClient } from "@pgpz/zec-shelf/client";
import { referenceZecShelfConfig, referenceZecShelfResources } from "@/content/zec-shelf";

export const metadata: Metadata = {
  title: "ZEC Shelf",
  description: "A public, read-only catalog owned by the PGPZ Reference application.",
  alternates: { canonical: "/zec-shelf" },
};

export default function ZecShelfPage() {
  return (
    <div className="pt-8 sm:pt-12">
      <ZecShelfClient
        initialResources={[...referenceZecShelfResources]}
        isAdmin={false}
        config={referenceZecShelfConfig}
      />
    </div>
  );
}
