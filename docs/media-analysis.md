# Media analysis: image grids, VidGrid, and transcripts

## What we have

- **the growth workspace now analyzes timeline videos directly.** Starting an analysis is
  the consent boundary: the growth workspace makes the source video durable in Blob, samples
  timestamped frames in the operator's browser, persists the derived boards
  immediately, transcribes the durable video with OpenAI Whisper, and stores a
  frame-cited creative analysis. There is no second "keep" step.
- **VidGrid** is installed as the optional local/operator tool for video. It
  samples a video into timestamped PNG boards so an agent can inspect a long
  recording as a set of visual timelines.
- **There is no installed `imggrid` or `mgrid` command.** For a single image,
  send the original directly to vision analysis. For several images, make a
  simple contact sheet with ImageMagick (`montage`) or an equivalent local
  command, then inspect that one sheet. Do not invent a separate tool name.
- **Transcription has two routes:** the the growth workspace product uses the hosted OpenAI
  `whisper-1` endpoint because it provides word timestamps; local VidGrid can
  use faster-whisper for an operator-only workflow.

## the growth workspace product workflow

```text
explicit Analyze action
-> durable source video in Blob
-> browser-local timestamped frame sampling
-> permanent storyboard boards in Blob
-> hosted Whisper word transcript
-> permanent frame-cited creative analysis
```

The timeline dialog exposes the same reel through `Video`, `Carousel`, `Grid`,
`Transcript`, and `Analysis` views. Frame and transcript-word interactions seek
the original video to the corresponding time.

The address is durable and agent-drivable:

```text
/app/feed-v5?post=<platform-post-id>&media=<index>&view=<view>
```

An approved analysis action additionally uses `action=analyze`. The shared
capability registry exposes `openTimelinePost` and `analyzeTimelineVideo`, so
the in-app assistant and deployed MCP receive the same canonical behavior.
Browser-local rendering still requires the resulting URL to be opened in a
browser; the durable record and navigation contract remain portable.

## Local operator workflow

```text
public URL -> yt-dlp -> local MP4/audio -> VidGrid boards + transcript -> vision analysis
```

1. Download the source with `yt-dlp`.
2. Use VidGrid for timestamped visual boards. Start at `3x3` for a useful
   balance of coverage and readable UI/text; use `2x2` for detail-heavy
   product walkthroughs.
3. For a spoken transcript, either pass `--transcribe` to VidGrid or extract
   audio and run the OpenAI transcription helper. Keep the two artifacts:
   transcript answers _what was said_; boards answer _what was shown_.
4. Feed selected boards and the transcript to vision/reasoning. The useful
   output is an evidence-backed critique of the design, editing, product flow,
   or implementation—not a frame-by-frame paraphrase.

Example:

```bash
# Public YouTube, X, Instagram Reel, or TikTok URL
yt-dlp -o /tmp/source.mp4 "URL"

# Timestamped boards and a local transcript/caption sidecar
vidgrid /tmp/source.mp4 -o /tmp/boards/source.png --grid 3x3 --transcribe

# Optional: render captions into the boards for a review artifact
vidgrid /tmp/source.mp4 -o /tmp/boards/captioned.png --grid 3x3 \
  --transcribe --burn-captions
```

VidGrid has a five-minute maximum per run. Trim or split longer videos first:

```bash
ffmpeg -i /tmp/source.mp4 -ss 00:05:00 -t 300 -c copy /tmp/part-02.mp4
```

## Standalone OpenAI transcript

Use this when the transcript matters more than burning captions into boards.
The helper reads the managed OpenClaw OpenAI skill key, with `OPENAI_API_KEY`
as an explicit shell/CI override.

```bash
ffmpeg -i /tmp/source.mp4 -vn -c:a aac /tmp/source.m4a
~/.bun/install/global/node_modules/openclaw/skills/openai-whisper-api/scripts/transcribe.sh \
  /tmp/source.m4a --language en --out /tmp/source.txt
```

The hosted upload limit is 25 MB. For a long video, use audio compression or
split into chronological parts before transcription, then join the text with
the part boundaries preserved.

## Platform access

| Source             | Normal path                   | When authentication is needed                                    |
| ------------------ | ----------------------------- | ---------------------------------------------------------------- |
| YouTube and Shorts | `yt-dlp URL`                  | Age-restricted/private: `--cookies-from-browser chrome`          |
| Instagram Reels    | `yt-dlp URL` for public reels | Private accounts: browser cookies                                |
| X/Twitter video    | `yt-dlp URL` for public posts | Protected accounts: browser cookies                              |
| TikTok             | `yt-dlp URL`                  | Browser cookies or geo handling if the platform blocks a request |

Use browser cookies only for Kristian's own authorized sessions. Do not publish,
copy, or persist cookies in a repo or an artifact.

## Image workflow

For one asset, use direct vision analysis. For a set of references, turn them
into a contact sheet so composition, palette, type, and repeated motifs can be
compared at once:

```bash
montage references/*.png -thumbnail 480x480 -geometry +12+12 \
  /tmp/reference-contact-sheet.png
```

This is particularly useful before an AI-generated landing page: separate the
references by the job they perform (layout, material/motion, palette/type),
then write a short creative direction with explicit constraints and exclusions.

## Practical rule

Use **VidGrid** for time-based media. Use **direct vision or a simple contact
sheet** for still images. Pair boards with a transcript whenever the meaning of
spoken instructions matters.
