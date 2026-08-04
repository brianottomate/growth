export type ShowcaseScene = {
  id: string;
  imageId: string;
  assetId: string;
  title: string;
  eyebrow: string;
  imageUrl: string;
  framing: string;
};

export type ShowcaseConnector = {
  id: string;
  fromSceneId: string;
  toSceneId: string;
  title: string;
  direction: "forward" | "descend" | "orbit-left" | "orbit-right";
  prompt: string;
  risk: string;
};

export const NORTH_TOPSAIL_SCENES: ShowcaseScene[] = [
  {
    id: "arrival",
    imageId: "NTP-0003",
    assetId: "576810187482991684",
    title: "Oceanfront arrival",
    eyebrow: "The coast appears first",
    imageUrl: "https://assets.wander.com/576810187482991684/fullres.webp",
    framing: "Drone three-quarter view, ocean horizon held high.",
  },
  {
    id: "rooftop",
    imageId: "NTP-0013",
    assetId: "576810125323406100",
    title: "The rooftop reveal",
    eyebrow: "Land above the sound",
    imageUrl: "https://assets.wander.com/576810125323406100/fullres.webp",
    framing: "Centered deck, red door and hot tub as forward targets.",
  },
  {
    id: "balcony",
    imageId: "NTP-0018",
    assetId: "576809973913227147",
    title: "Follow the sunset",
    eyebrow: "Drop to the ocean balcony",
    imageUrl: "https://assets.wander.com/576809973913227147/fullres.webp",
    framing: "Strong corridor perspective with the glass door on camera-left.",
  },
  {
    id: "living",
    imageId: "NTP-0028",
    assetId: "561581225785953806",
    title: "Inside, without losing the view",
    eyebrow: "Pass through the glass",
    imageUrl: "https://assets.wander.com/561581225785953806/fullres.webp",
    framing: "Wide living room with the balcony portal on camera-right.",
  },
  {
    id: "kitchen",
    imageId: "NTP-0035",
    assetId: "561581572294180868",
    title: "The gathering floor",
    eyebrow: "Glide toward the kitchen",
    imageUrl: "https://assets.wander.com/561581572294180868/fullres.webp",
    framing:
      "Island anchors the foreground; open portal carries the camera onward.",
  },
  {
    id: "bedroom",
    imageId: "NTP-0055",
    assetId: "561580855290498538",
    title: "Wake up beside the Atlantic",
    eyebrow: "Settle into the primary suite",
    imageUrl: "https://assets.wander.com/561580855290498538/fullres.webp",
    framing: "Bed and balcony share the frame; preserve all furniture exactly.",
  },
  {
    id: "pool",
    imageId: "NTP-0001",
    assetId: "685132288769396463",
    title: "One last look back",
    eyebrow: "Pull out over the pool",
    imageUrl: "https://assets.wander.com/685132288769396463/fullres.webp",
    framing: "Symmetrical closing exterior with the pool centered.",
  },
];

export const NORTH_TOPSAIL_CONNECTORS: ShowcaseConnector[] = [
  {
    id: "arrival-to-rooftop",
    fromSceneId: "arrival",
    toSceneId: "rooftop",
    title: "Descend onto the roof",
    direction: "descend",
    prompt:
      "A controlled drone descent toward the visible rooftop terrace, preserving the house, neighboring homes, coastline, and sunset. Land in the exact rooftop target frame.",
    risk: "Roof geometry and neighboring houses must remain stable.",
  },
  {
    id: "rooftop-to-balcony",
    fromSceneId: "rooftop",
    toSceneId: "balcony",
    title: "Slip down the ocean side",
    direction: "forward",
    prompt:
      "Glide forward across the rooftop, then descend one level along the ocean-facing facade and settle on the balcony in the exact target frame.",
    risk: "The model may invent the vertical route between floors.",
  },
  {
    id: "balcony-to-living",
    fromSceneId: "balcony",
    toSceneId: "living",
    title: "Turn through the glass",
    direction: "orbit-left",
    prompt:
      "Move along the balcony, orbit left through the existing red-framed glass opening, and reveal the living room. Do not invent doors, windows, furniture, or decor.",
    risk: "The source pair reverses camera direction and is the hardest seam.",
  },
  {
    id: "living-to-kitchen",
    fromSceneId: "living",
    toSceneId: "kitchen",
    title: "Float around the gathering space",
    direction: "orbit-left",
    prompt:
      "Float left around the sofa into the adjacent kitchen, preserving the open-plan layout and every fixed object, then settle into the exact kitchen frame.",
    risk: "Open-plan geometry must match both frames without duplicating objects.",
  },
  {
    id: "kitchen-to-bedroom",
    fromSceneId: "kitchen",
    toSceneId: "bedroom",
    title: "Rise into the quiet floor",
    direction: "forward",
    prompt:
      "Move through the visible interior portal and transition upstairs into the ocean-facing primary bedroom, keeping the architectural language and lighting coherent.",
    risk: "This is magical compression, not a literal floor-plan claim.",
  },
  {
    id: "bedroom-to-pool",
    fromSceneId: "bedroom",
    toSceneId: "pool",
    title: "Pull back through the balcony",
    direction: "orbit-right",
    prompt:
      "Pull backward from the primary bedroom through the existing balcony opening, accelerate into a smooth exterior reveal, and end on the exact pool facade frame.",
    risk: "The pool shape, facade openings, and balcony positions cannot drift.",
  },
];

export const NORTH_TOPSAIL_COMPOSITION = {
  schemaVersion: 1,
  property: {
    id: "cmay6f67h15rh5xmbqo6itekp",
    name: "Wander North Topsail Beach",
    slug: "wander-north-topsail-beach",
    url: "https://www.wander.com/property/wander-north-topsail-beach",
  },
  acquisition: {
    source: "Wander property page ordered PROPERTY gallery",
    indexedImages: 129,
    imggridBoards: 9,
    decodeErrors: 0,
  },
  scenes: NORTH_TOPSAIL_SCENES,
  connectors: NORTH_TOPSAIL_CONNECTORS,
  generatedDemo: {
    videoUrl: "/lab/property-showcase/videos/roof-to-living-scroll.mp4",
    posterUrl: "/lab/property-showcase/keyframes/roof-overhead.png",
    durationSeconds: 20.13,
    estimatedSpendUsd: 2.89,
    generatedKeyframes: 2,
    models: ["Kling O3 Standard", "Seedance 2 Fast"],
  },
};
