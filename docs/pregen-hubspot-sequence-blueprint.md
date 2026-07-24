# HubSpot sequence blueprint: pregen personalized pilot

## Seat access

Kristian's Sales Hub Enterprise seat was activated and sequence creation access
was verified in HubSpot on July 24, 2026. HubSpot's public API can read and
enroll sequences but cannot create or edit them, so initial sequence setup still
happens in HubSpot's UI.

## Sequence

**Name:** `PILOT - Pre-Gen Sites - Personalized 2-Touch - DO NOT ENROLL`

Keep the sequence dormant until a reviewed contact has all five contract
properties populated. Do not make enrollment part of copy approval.

### Touch 1

- Type: automated email
- Delay: immediately after explicit enrollment
- Subject: contact personalization token `growth_pregen_touch_1_subject`
- Body: contact personalization token `growth_pregen_touch_1_body`
- Preview link: the reviewed body may reference
  `growth_pregen_preview_url`; keep the URL as its own token so the editor can
  make it a stable CTA.

Fallback values must be visibly unsendable:

- Subject fallback: `[SUBJECT NOT REVIEWED - DO NOT SEND]`
- Body fallback: `[BODY NOT REVIEWED - DO NOT SEND]`

### Touch 2

- Type: automated email
- Delay: 3 business days
- Subject: contact personalization token `growth_pregen_touch_2_subject`
- Body: contact personalization token `growth_pregen_touch_2_body`
- Same unsendable fallback convention as touch 1.

## Cohort posture

- **Recycled:** rep-controlled, conservative copy. Start with a standard
  sequence structure and use personalization only after the rep reviews it.
- **Untouched:** primary LLM-personalization test cohort.

The sequence itself should not decide the cohort. Growth preserves list
membership and the operator chooses the sequence/enrollment deliberately.
