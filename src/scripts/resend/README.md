# Resend Management Scripts

Utility scripts for managing Resend topics and email preferences.

## Prerequisites

Set your Resend API key in `.env`:

```bash
RESEND_API_KEY=re_xxxxx
```

## Available Scripts

### List Topics

View all existing topics in your Resend account:

```bash
bun src/scripts/resend/list-topics.ts
```

### Delete All Topics

Clean up all topics (useful when resetting topic structure):

```bash
bun src/scripts/resend/delete-all-topics.ts
```

**Note:** Update the `TOPICS_TO_DELETE` array in this script with your actual topic IDs before running.

## Creating Custom Topics

To create topics for your application, use the Resend API directly or create a custom script based on these examples.

Example topic structure:

```typescript
export const NEWSLETTER_TOPICS = {
  GENERAL: "general_newsletter",
  PRODUCT_TIPS: "product_tips",
  PRODUCT_UPDATES: "product_updates",
  FEATURE_NEWS: "feature_news",
  FEATURE_WAITLIST: "feature_waitlist",
  BETA_ACCESS: "beta_waitlist",
} as const;
```

## Notes

- Topic IDs are unique identifiers used in your code
- Topic names are display names shown to users
- Consider using `opt_in` for newsletters and `opt_out` for transactional emails
- All scripts respect Resend rate limits (2 req/sec)
