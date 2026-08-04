# Property showcase lab

This lab tests whether a Wander property gallery can become a magical,
scroll-controlled tour before the concept is attached to product or publishing
architecture.

## Rule

The lab may generate camera movement between real property photographs, but it
must make the source frames, generated frames, and seams inspectable. A
connector is an experimental interpretation, not evidence of the property's
literal floor plan.

## Artifacts

The experiment uses three deliberately small contracts:

1. `source-manifest.json` records the Wander property URL, its canonical gallery
   order, stable asset IDs, full-resolution URLs, local review files,
   dimensions, and hashes.
2. `composition.ts` records the tracked source-image choices and the intended
   camera move between them.
3. A future generation manifest will record dive and connector clips, exact
   boundary frames, provider receipts, review state, and accepted outputs.

The first North Topsail flight was generated under a $5 experiment cap. It used
four accepted clips and two generated spatial bridge frames, with estimated
provider spend of $2.89. Receipts remain in the ignored run directory.

## Acquisition

Use the public Wander property page's Next flight payload. It already contains
stable `assets.wander.com` URLs and an explicitly ordered `PROPERTY` gallery.
The script downloads 1200 px review copies into the ignored `runs/` directory
and keeps the full-resolution URL for shortlisted originals. North Topsail's
current gallery contains exactly 129 ordered images. The larger page payload
also contains cover and neighborhood media, which are intentionally excluded.

```bash
bun scripts/lab/acquire-property-showcase-images.ts \
  --property https://www.wander.com/property/wander-north-topsail-beach
```

Firecrawl is not part of this path. It is useful when a page must be rendered or
discovered, but it would add an unnecessary extraction layer between this lab
and Wander's own asset payload.

## Review

Build ImgGrid boards from `runs/property-showcase/<slug>/gallery-images`.
Select an ordered story, then inspect only those originals at full resolution.

The first North Topsail composition should cover arrival, rooftop, living,
kitchen or dining, primary bedroom, and water or beach finale. It should favor
pairs with strong shared vanishing points or camera direction because those
pairs give a frame-conditioned connector the best chance of feeling coherent.

## Generation

Use the connected-chain version of the scroll-world pattern:

- a dive clip for every selected scene;
- a connector between every adjacent scene;
- connector inputs are the actual last frame of the preceding clip and the
  actual first frame of the next clip;
- native mobile is a separate 9:16 chain, not a crop;
- every clip is generated offline and the browser only scrubs time.

The first stress test deliberately narrows this to one route: rooftop aerial,
terrace, red door, generated stairwell, and living room. Kling O3 Standard won
the cheaper geometric moves; Seedance 2 Fast won the hard terrace-to-stairwell
comparison because it preserved one coherent red door instead of duplicating
the opening.
