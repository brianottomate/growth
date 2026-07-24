# HubSpot sequence blueprint: pregen personalized outreach

## Seat access

Kristian's Sales Hub Enterprise seat was activated and sequence creation access
was verified in HubSpot on July 24, 2026. HubSpot's public API can read and
enroll sequences but cannot create or edit them, so initial sequence setup still
happens in HubSpot's UI.

## Current four-touch drafts

Both sequences are private, owned by Kristian Boe, and had zero enrollments at
creation on July 24, 2026.

| Motion         | HubSpot sequence                                                                | Business-day cadence | Target                                                                    |
| -------------- | ------------------------------------------------------------------------------- | -------------------- | ------------------------------------------------------------------------- |
| Re-engagement  | [308080466](https://app.hubspot.com/sequences/22480390/sequence/308080466/edit) | 1, 5, 9, 15          | Recycled lists `3808` / `3809`                                            |
| Fresh outreach | [308081169](https://app.hubspot.com/sequences/22480390/sequence/308081169/edit) | 1, 4, 8, 13          | Untouched lists `3811` / `3812`, then net-new Mexico and Europe prospects |

Keep both dormant until a reviewed contact has the required contract properties
populated. Do not make enrollment part of copy approval.

### Shared template rules

- HubSpot owns the paragraphs and blank paragraphs. Never inject a complete
  multiline email through one contact-property token.
- Use HubSpot's built-in first-name token with `there` as its fallback.
- Include WanderOS as the direct-booking platform for property managers from
  the team behind Wander.com.
- Use the sender's HubSpot default signature; do not hard-code a signature in
  the template.
- Keep every custom fallback visibly unsendable:
  `[... NOT REVIEWED — DO NOT SEND]`.
- Touches 2 through 4 reply in-thread. This keeps the preview and the short
  WanderOS explanation visible as context and avoids manufacturing four
  separate inbox threads.

### Re-engagement copy

Touch 1 acknowledges the history without inventing a prior conversation:

> Hi `first_name`,
>
> I know Wander has been in touch before, so I’ll skip the generic
> introduction. WanderOS is the direct-booking platform for property managers
> from the team behind Wander.com.
>
> Rather than ask you to reconsider WanderOS in the abstract, our team put
> together a private working concept using your actual inventory:
>
> `growth_pregen_preview_url`
>
> The search and property pages work, but nothing can be booked.
>
> Worth a fresh look?

Touch 2 gives the product explanation and one reviewed fit observation:

> Hi `first_name`,
>
> The reason I’m coming back is that there’s now something concrete to react
> to.
>
> What you saw is not just a visual redesign. WanderOS connects to the existing
> PMS, brings over listings, photos, pricing, and availability, then publishes
> on the property manager’s own domain with payments and analytics built in.
>
> `growth_pregen_touch_2_fit`
>
> Would a 15-minute walkthrough be useful?

Touch 3 distributes proof instead of overloading touch 1:

> Hi `first_name`,
>
> A quick bit of context on the team behind the preview: across Wander.com,
> we’ve seen $75M+ in bookings and 70,000+ nights booked.
>
> WanderOS applies what we’ve learned building that guest and booking
> experience to property managers’ own brands and domains.
>
> Open to a quick look next week?

Touch 4 closes the loop:

> Hi `first_name`,
>
> We’ve reached out before, so I don’t want to keep circling.
>
> Should I leave the preview with you, or is there someone else who owns the
> direct-booking experience?
>
> Happy to send it their way.

### Fresh-outreach copy

Touch 1 introduces both brands:

> Hi `first_name`,
>
> I’m with WanderOS, the direct-booking platform for property managers from the
> team behind Wander.com, the luxury vacation-home platform.
>
> Our team put together a private working concept using your actual inventory.
> The search and property pages work, but nothing can be booked.
>
> `growth_pregen_preview_url`
>
> Worth a 15-minute look?

Touch 2 explains the product, with the reviewed
`growth_pregen_touch_2_fit` paragraph. Touch 3 uses the same Wander.com proof
paragraphs as the re-engagement sequence. Touch 4 changes the opener to:

> I’ll close the loop here.

The older [personalized two-touch pilot](https://app.hubspot.com/sequences/22480390/sequence/308080004/edit)
remains intact for the original test enrollment. It is not the default for
either cohort.
