import { MarketplaceWorkspace } from "./MarketplaceWorkspace";

import { wanderMarketplaceListings } from "@/data/marketplace-content";

export default function AppsPage() {
  return <MarketplaceWorkspace listings={wanderMarketplaceListings} />;
}
