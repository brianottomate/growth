export type WorkspaceHome = {
  id: string;
  name: string;
  imageUrl: string;
  thumbUrl: string | null;
  city: string | null;
  state: string | null;
  bedrooms: number | null;
  bathrooms: number | null;
  guests: number | null;
  rating: number | null;
};

export type WorkspaceCampaign = {
  id: string;
  name: string;
  state: "draft" | "pushed" | "live" | "ended";
  budget: number;
  spend: number;
  adCount: number;
  platforms: { platform: string; status: string }[];
};

export type WorkspaceData = {
  brand: {
    id: string;
    name: string;
    slug: string;
    website: string | null;
    avatarUrl: string | null;
    delivery: string;
    deliveryLabel: string;
  };
  budget: { total: number | null; spend: number | null };
  campaigns: WorkspaceCampaign[];
  homes: WorkspaceHome[];
  starting: WorkspaceHome[];
  startingSource: "ads" | "feed";
  adCount: number;
  marketCity: string | null;
};
