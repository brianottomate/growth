import { Suspense } from "react";
import {
  completeText,
  isClaudeConfigured,
  CLAUDE_MODELS,
} from "@/server/clients/claude.client";

/**
 * Claude API Demo
 *
 * This page demonstrates various usage patterns of the claude.client.ts wrapper.
 * Check the Server Actions below to see different API patterns in action.
 */

export default function ClaudeApiDemoPage() {
  return (
    <div className="container mx-auto max-w-4xl py-8">
      <div className="mb-8">
        <h1 className="mb-2 text-3xl font-bold">Claude API Demo</h1>
        <p className="text-muted-foreground">
          Examples demonstrating the claude.client.ts wrapper functions
        </p>
      </div>

      {!isClaudeConfigured && (
        <div className="mb-6 rounded-lg border border-yellow-500 bg-yellow-50 p-4 dark:bg-yellow-950">
          <p className="text-sm font-medium text-yellow-800 dark:text-yellow-200">
            ⚠️ ANTHROPIC_API_KEY is not configured. Add it to your .env file to
            enable Claude features.
          </p>
        </div>
      )}

      <div className="space-y-6">
        {/* Simple Text Completion */}
        <section className="rounded-lg border p-6">
          <h2 className="mb-4 text-xl font-semibold">
            1. Simple Text Completion
          </h2>
          <p className="mb-4 text-sm text-muted-foreground">
            Using <code>completeText()</code> - the simplest way to get a
            response
          </p>
          <Suspense fallback={<p>Loading...</p>}>
            <SimpleCompletionDemo />
          </Suspense>
        </section>

        {/* Conversation History */}
        <section className="rounded-lg border p-6">
          <h2 className="mb-4 text-xl font-semibold">
            2. Multi-turn Conversation
          </h2>
          <p className="mb-4 text-sm text-muted-foreground">
            Using <code>continueConversation()</code> to maintain context
          </p>
          <div className="rounded bg-muted p-4">
            <p className="text-sm">
              See the code in <code>page.tsx</code> for conversation examples
            </p>
          </div>
        </section>

        {/* Model Comparison */}
        <section className="rounded-lg border p-6">
          <h2 className="mb-4 text-xl font-semibold">3. Model Comparison</h2>
          <p className="mb-4 text-sm text-muted-foreground">
            Compare responses from different Claude models
          </p>
          <Suspense fallback={<p>Loading...</p>}>
            <ModelComparisonDemo />
          </Suspense>
        </section>

        {/* Code Examples */}
        <section className="rounded-lg border p-6">
          <h2 className="mb-4 text-xl font-semibold">
            4. Common Usage Patterns
          </h2>
          <div className="space-y-4">
            <CodeExample
              title="Basic Usage"
              code={`import { completeText } from '@/server/clients/claude.client';

const result = await completeText({
  prompt: "Explain React hooks in one sentence",
  system: "You are a technical educator",
});
console.log(result.text);`}
            />

            <CodeExample
              title="Streaming"
              code={`import { streamMessage } from '@/server/clients/claude.client';

const stream = await streamMessage({
  messages: [{ role: "user", content: "Write a story" }],
});

for await (const event of stream) {
  if (event.type === "content_block_delta" &&
      event.delta.type === "text_delta") {
    process.stdout.write(event.delta.text);
  }
}`}
            />

            <CodeExample
              title="Vision"
              code={`import { analyzeImageFromUrl } from '@/server/clients/claude.client';

const result = await analyzeImageFromUrl({
  imageUrl: "https://example.com/image.jpg",
  prompt: "What's in this image?",
});`}
            />

            <CodeExample
              title="Conversation"
              code={`import { continueConversation } from '@/server/clients/claude.client';
import type { ConversationMessage } from '@/server/clients/claude.client';

const history: ConversationMessage[] = [];

const response = await continueConversation({
  history,
  newMessage: "Hello!",
  system: "You are a helpful assistant",
});

history.push(
  { role: "user", content: "Hello!" },
  { role: "assistant", content: response.text }
);`}
            />
          </div>
        </section>
      </div>
    </div>
  );
}

// =====================================================
// DEMO COMPONENTS
// =====================================================

async function SimpleCompletionDemo() {
  if (!isClaudeConfigured) {
    return <NotConfiguredMessage />;
  }

  try {
    const result = await completeText({
      prompt: "Explain quantum computing in exactly one sentence",
      system: "You are a science educator. Be concise.",
      model: CLAUDE_MODELS.SONNET_4_5,
      max_tokens: 100,
    });

    return (
      <div className="space-y-2">
        <div className="rounded bg-muted p-4">
          <p className="text-sm">{result.text}</p>
        </div>
        <div className="flex gap-4 text-xs text-muted-foreground">
          <span>Input tokens: {result.usage.input_tokens}</span>
          <span>Output tokens: {result.usage.output_tokens}</span>
          <span>Total: {result.usage.total_tokens}</span>
        </div>
      </div>
    );
  } catch (error) {
    return <ErrorMessage error={error} />;
  }
}

async function ModelComparisonDemo() {
  if (!isClaudeConfigured) {
    return <NotConfiguredMessage />;
  }

  const prompt = "Write a haiku about coding";

  try {
    const [sonnet, haiku] = await Promise.all([
      completeText({
        prompt,
        model: CLAUDE_MODELS.SONNET_4_5,
        max_tokens: 100,
      }),
      completeText({
        prompt,
        model: CLAUDE_MODELS.HAIKU_3_5,
        max_tokens: 100,
      }),
    ]);

    return (
      <div className="space-y-4">
        <div>
          <h3 className="mb-2 text-sm font-medium">
            Sonnet 4.5 (Balanced, Intelligent)
          </h3>
          <div className="rounded bg-muted p-4">
            <p className="whitespace-pre-wrap text-sm">{sonnet.text}</p>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {sonnet.usage.total_tokens} tokens
          </p>
        </div>

        <div>
          <h3 className="mb-2 text-sm font-medium">
            Haiku 3.5 (Fast, Affordable)
          </h3>
          <div className="rounded bg-muted p-4">
            <p className="whitespace-pre-wrap text-sm">{haiku.text}</p>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {haiku.usage.total_tokens} tokens
          </p>
        </div>
      </div>
    );
  } catch (error) {
    return <ErrorMessage error={error} />;
  }
}

// =====================================================
// UTILITY COMPONENTS
// =====================================================

function CodeExample({ title, code }: { title: string; code: string }) {
  return (
    <div>
      <h3 className="mb-2 text-sm font-medium">{title}</h3>
      <pre className="overflow-x-auto rounded bg-muted p-4 text-xs">
        <code>{code}</code>
      </pre>
    </div>
  );
}

function NotConfiguredMessage() {
  return (
    <div className="rounded bg-yellow-50 p-4 dark:bg-yellow-950">
      <p className="text-sm text-yellow-800 dark:text-yellow-200">
        ANTHROPIC_API_KEY not configured. Add it to your .env file to see this
        demo.
      </p>
    </div>
  );
}

function ErrorMessage({ error }: { error: unknown }) {
  const message = error instanceof Error ? error.message : "Unknown error";
  return (
    <div className="rounded bg-red-50 p-4 dark:bg-red-950">
      <p className="text-sm font-medium text-red-800 dark:text-red-200">
        Error:
      </p>
      <p className="mt-1 text-sm text-red-700 dark:text-red-300">{message}</p>
    </div>
  );
}
