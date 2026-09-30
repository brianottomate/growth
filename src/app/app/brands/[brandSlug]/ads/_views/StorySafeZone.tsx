import { STORY_SAFE_ZONE } from "@/lib/compositions";

const MARK = "rgba(255,255,255,0.55)";
const EDGE = "1px dashed rgba(255,255,255,0.45)";

/**
 * What Meta lays over a Story or Reel, drawn faintly on the preview: the
 * profile header in the top band, the caption and call to action in the
 * bottom one. The artwork keeps its text out of both, and this shows why.
 */
export function StorySafeZone() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0">
      <div
        className="absolute inset-x-0 top-0 flex flex-col gap-2 px-[5%] pt-[3%]"
        style={{ height: `${STORY_SAFE_ZONE.top * 100}%`, borderBottom: EDGE }}
      >
        <div
          className="h-0.5 w-full rounded-full"
          style={{ background: MARK }}
        />
        <div className="flex items-center gap-2">
          <div
            className="aspect-square w-[9%] rounded-full"
            style={{ background: MARK }}
          />
          <div
            className="h-1.5 w-1/4 rounded-full"
            style={{ background: MARK }}
          />
        </div>
      </div>
      <div
        className="absolute inset-x-0 bottom-0 flex flex-col justify-end gap-2 px-[5%] pb-[6%]"
        style={{ height: `${STORY_SAFE_ZONE.bottom * 100}%`, borderTop: EDGE }}
      >
        <div
          className="h-1.5 w-3/5 rounded-full"
          style={{ background: MARK }}
        />
        <div
          className="h-1.5 w-2/5 rounded-full"
          style={{ background: MARK }}
        />
        <div
          className="mt-2 h-7 w-full rounded-md"
          style={{ background: "rgba(255,255,255,0.35)" }}
        />
      </div>
    </div>
  );
}
