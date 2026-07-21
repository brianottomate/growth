import { MarketplaceWorkspace } from "../MarketplaceWorkspace";

import { wanderMarketplaceListings } from "@/data/marketplace-content";

export default function MarketplacePlaybookPage() {
  return <MarketplaceWorkspace listings={wanderMarketplaceListings} />;
}
