import { InteractiveExamples } from "./interactive-examples";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

/**
 * CLIENT COMPONENTS BEST PRACTICES
 *
 * This page demonstrates when and how to use Client Components.
 * The page itself is a Server Component, but it imports Client Components
 * for interactive features.
 *
 * This is the recommended pattern: Server Components by default,
 * Client Components only when needed for interactivity.
 */

export default function ClientComponentsDemo() {
  return (
    <div className="container mx-auto max-w-4xl px-4 py-8">
      <div className="mb-8">
        <h1 className="mb-2 text-4xl font-bold">Client Components Demo</h1>
        <p className="text-muted-foreground">
          Examples of when and how to use Client Components for interactive UI
        </p>
      </div>

      {/* Pattern Explanation */}
      <Card className="border-primary mb-8">
        <CardHeader>
          <CardTitle>Key Concepts</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <h3 className="mb-2 font-semibold">
              ✅ Use Client Components When You Need:
            </h3>
            <ul className="text-muted-foreground ml-4 list-inside list-disc space-y-1 text-sm">
              <li>React hooks (useState, useEffect, useContext, etc.)</li>
              <li>Event listeners (onClick, onChange, onSubmit, etc.)</li>
              <li>Browser-only APIs (localStorage, window, navigator, etc.)</li>
              <li>Custom hooks that depend on state or effects</li>
              <li>State management libraries (Context, Zustand, etc.)</li>
            </ul>
          </div>
          <div>
            <h3 className="mb-2 font-semibold">🎯 Best Practices:</h3>
            <ul className="text-muted-foreground ml-4 list-inside list-disc space-y-1 text-sm">
              <li>
                Use &quot;use client&quot; directive at the top of the file
              </li>
              <li>Keep Client Components as small/granular as possible</li>
              <li>
                Prefer Server Components by default, Client only when needed
              </li>
              <li>
                Can compose: Server → Client → Server (via children/props)
              </li>
              <li>Use React 19 features: useOptimistic, useActionState</li>
            </ul>
          </div>
        </CardContent>
      </Card>

      {/* Interactive Examples */}
      <InteractiveExamples />

      {/* Code Examples */}
      <section className="mt-8">
        <h2 className="mb-4 text-2xl font-bold">Code Pattern</h2>
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">
              Client Component Structure
            </CardTitle>
          </CardHeader>
          <CardContent>
            <pre className="bg-muted overflow-x-auto rounded-lg p-4 text-xs">
              {`// components/counter.tsx
"use client"; // ← Required for client components

import { useState } from "react";
import { Button } from "@/components/ui/button";

export function Counter() {
  // ✅ Can use hooks
  const [count, setCount] = useState(0);

  // ✅ Can use event handlers
  const increment = () => setCount(c => c + 1);

  return (
    <div>
      <p>Count: {count}</p>
      <Button onClick={increment}>
        Increment
      </Button>
    </div>
  );
}

// app/page.tsx (Server Component)
import { Counter } from "@/components/counter";

export default function Page() {
  // ✅ Server Component can import Client Components
  return (
    <div>
      <h1>My Page</h1>
      <Counter /> {/* Interactive */}
    </div>
  );
}`}
            </pre>
          </CardContent>
        </Card>
      </section>

      {/* Composition Pattern */}
      <section className="mt-8">
        <h2 className="mb-4 text-2xl font-bold">Composition Pattern</h2>
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">
              Server → Client → Server (via children)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <pre className="bg-muted overflow-x-auto rounded-lg p-4 text-xs">
              {`// components/client-wrapper.tsx
"use client";

import { ReactNode, useState } from "react";

export function ClientWrapper({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div>
      <button onClick={() => setIsOpen(!isOpen)}>Toggle</button>
      {isOpen && children} {/* ← Can render Server Components! */}
    </div>
  );
}

// app/page.tsx (Server Component)
import { ClientWrapper } from "@/components/client-wrapper";
import { ServerData } from "@/components/server-data"; // Server Component

export default function Page() {
  return (
    <ClientWrapper>
      {/* ✅ Server Component passed as children */}
      <ServerData />
    </ClientWrapper>
  );
}`}
            </pre>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
