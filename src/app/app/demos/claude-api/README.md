# Claude API Demo

This demo showcases the `claude.client.ts` wrapper for the Anthropic SDK.

## Setup

1. Get your API key from [Anthropic Console](https://console.anthropic.com/settings/keys)
2. Add to your `.env` file:
   ```bash
   ANTHROPIC_API_KEY=sk-ant-api03-...
   ```

## Available Wrapper Functions

### 1. Simple Text Completion
```ts
import { completeText } from '@/server/clients/claude.client';

const result = await completeText({
  prompt: "Your question here",
  system: "Optional system prompt",
  model: CLAUDE_MODELS.SONNET_4_5,
  max_tokens: 1000,
});

console.log(result.text);
console.log(result.usage); // Token usage info
```

### 2. Streaming Responses
```ts
import { streamMessage } from '@/server/clients/claude.client';

const stream = await streamMessage({
  messages: [{ role: "user", content: "Write a story" }],
});

for await (const event of stream) {
  if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
    console.log(event.delta.text); // Stream chunks
  }
}
```

### 3. Multi-turn Conversations
```ts
import { continueConversation } from '@/server/clients/claude.client';
import type { ConversationMessage } from '@/server/clients/claude.client';

const history: ConversationMessage[] = [];

// First turn
const response1 = await continueConversation({
  history,
  newMessage: "Hello, I'm learning React",
  system: "You are a React expert",
});

history.push(
  { role: "user", content: "Hello, I'm learning React" },
  { role: "assistant", content: response1.text }
);

// Second turn - Claude remembers context
const response2 = await continueConversation({
  history,
  newMessage: "What are hooks?",
});
```

### 4. Vision (Image Analysis)
```ts
import { analyzeImageFromUrl } from '@/server/clients/claude.client';

const result = await analyzeImageFromUrl({
  imageUrl: "https://example.com/image.jpg",
  prompt: "What's in this image? Be detailed.",
});

console.log(result.text);
```

### 5. Response Shaping (Prefill)
```ts
import { createMessageWithPrefill } from '@/server/clients/claude.client';

const result = await createMessageWithPrefill({
  prompt: "List top 3 JavaScript frameworks",
  prefill: '{"frameworks": [',
  system: "Always respond with valid JSON",
});

// Claude continues from the prefill: "React", "Vue", "Angular"]}'
console.log(result.fullText); // Complete JSON
```

### 6. Direct SDK Access
When you need full control, use the SDK directly:
```ts
import { anthropic } from '@/server/clients/claude.client';

const message = await anthropic.messages.create({
  model: "claude-sonnet-4-5-20250929",
  max_tokens: 1024,
  messages: [
    { role: "user", content: "Hello!" }
  ],
  // Any other SDK options...
});
```

## Model Selection

Use the `CLAUDE_MODELS` constants:
```ts
import { CLAUDE_MODELS } from '@/server/clients/claude.client';

CLAUDE_MODELS.SONNET_4_5    // Default: Best balance (fast + intelligent)
CLAUDE_MODELS.OPUS_4_5      // Most capable (expensive)
CLAUDE_MODELS.HAIKU_3_5     // Fastest + cheapest
CLAUDE_MODELS.SONNET_3_7    // Economy tier (3x cheaper than Sonnet 4.5)
```

## Utilities

### Extract Text
```ts
import { extractText } from '@/server/clients/claude.client';

const message = await createMessage({ ... });
const text = extractText(message); // Gets all text blocks
```

### Token Usage
```ts
import { calculateTokenUsage } from '@/server/clients/claude.client';

const message = await createMessage({ ... });
const usage = calculateTokenUsage(message);
console.log(usage.total); // Total tokens used
```

### Error Handling
```ts
import { handleAnthropicError } from '@/server/clients/claude.client';

try {
  const result = await completeText({ ... });
} catch (error) {
  const handled = handleAnthropicError(error);

  if (handled.isRateLimited) {
    // Implement retry logic
  }
  if (handled.isAuthError) {
    // Check API key
  }
}
```

## Learn More

- [Anthropic API Docs](https://docs.anthropic.com/)
- [Model Pricing](https://www.anthropic.com/pricing)
- [Best Practices](https://docs.anthropic.com/en/docs/build-with-claude/prompt-engineering/overview)
- [Vision Guide](https://docs.anthropic.com/en/docs/build-with-claude/vision)
- [Streaming Guide](https://docs.anthropic.com/en/api/messages-streaming)

## Examples in this Codebase

Check `src/server/clients/claude.client.ts` for:
- ✅ Full TypeScript types
- ✅ JSDoc examples for every function
- ✅ Error handling patterns
- ✅ Token counting helpers
- ✅ Streaming utilities

## Tips

1. **Use Sonnet 4.5 by default** - Best balance of speed/intelligence
2. **Stream for long responses** - Better UX for users
3. **System prompts are powerful** - Guide Claude's behavior
4. **Manage conversation history** - Use `continueConversation()` helper
5. **Monitor token usage** - Track costs with `calculateTokenUsage()`
6. **Check configuration** - Use `isClaudeConfigured` before calling API
