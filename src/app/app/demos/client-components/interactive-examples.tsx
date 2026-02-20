"use client";

import { useState, useEffect, useOptimistic } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

/**
 * INTERACTIVE EXAMPLES - CLIENT COMPONENT
 *
 * This file must be a Client Component because it uses:
 * - useState (state management)
 * - useEffect (side effects)
 * - useOptimistic (React 19 feature)
 * - Event handlers (onClick, onChange, etc.)
 */

export function InteractiveExamples() {
  return (
    <div className="space-y-8">
      <CounterExample />
      <FormExample />
      <LocalStorageExample />
      <OptimisticUIExample />
    </div>
  );
}

// ============================================================
// EXAMPLE 1: Basic State Management with useState
// ============================================================

function CounterExample() {
  const [count, setCount] = useState(0);

  return (
    <section>
      <h2 className="mb-4 text-2xl font-bold">
        1. State Management (useState)
      </h2>
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Interactive Counter</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4">
            <Button
              onClick={() => setCount((c) => c - 1)}
              variant="outline"
              size="lg"
            >
              -
            </Button>
            <div className="min-w-[100px] text-center text-4xl font-bold">
              {count}
            </div>
            <Button
              onClick={() => setCount((c) => c + 1)}
              variant="outline"
              size="lg"
            >
              +
            </Button>
            <Button onClick={() => setCount(0)} variant="secondary" size="lg">
              Reset
            </Button>
          </div>
          <p className="text-muted-foreground mt-4 text-sm">
            Uses useState for local state management and onClick event handlers
          </p>
        </CardContent>
      </Card>
    </section>
  );
}

// ============================================================
// EXAMPLE 2: Form Handling with Controlled Components
// ============================================================

function FormExample() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
    toast.success(`Form submitted for ${name}!`);

    // Reset after 3 seconds
    setTimeout(() => {
      setSubmitted(false);
      setName("");
      setEmail("");
    }, 3000);
  };

  return (
    <section>
      <h2 className="mb-4 text-2xl font-bold">2. Form Handling (Controlled)</h2>
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Controlled Form Inputs</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="name" className="mb-1 block text-sm font-medium">
                Name
              </label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Enter your name"
                required
              />
            </div>
            <div>
              <label htmlFor="email" className="mb-1 block text-sm font-medium">
                Email
              </label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Enter your email"
                required
              />
            </div>
            <Button type="submit" disabled={submitted}>
              {submitted ? "Submitted!" : "Submit"}
            </Button>
          </form>
          <p className="text-muted-foreground mt-4 text-sm">
            Controlled inputs with onChange handlers and form submission
          </p>
        </CardContent>
      </Card>
    </section>
  );
}

// ============================================================
// EXAMPLE 3: Browser API Usage (localStorage) with useEffect
// ============================================================

function LocalStorageExample() {
  const [theme, setTheme] = useState<"light" | "dark">("light");

  // ✅ useEffect for side effects (localStorage access)
  useEffect(() => {
    // Load from localStorage on mount
    const saved = localStorage.getItem("demo-theme");
    if (saved === "light" || saved === "dark") {
      setTheme(saved);
    }
  }, []);

  useEffect(() => {
    // Save to localStorage when theme changes
    localStorage.setItem("demo-theme", theme);
  }, [theme]);

  return (
    <section>
      <h2 className="mb-4 text-2xl font-bold">3. Browser APIs (useEffect)</h2>
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">localStorage Integration</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4">
            <div className="flex-1">
              <p className="mb-2 text-sm">Current Theme: {theme}</p>
              <div className="flex gap-2">
                <Button
                  onClick={() => setTheme("light")}
                  variant={theme === "light" ? "default" : "outline"}
                >
                  Light
                </Button>
                <Button
                  onClick={() => setTheme("dark")}
                  variant={theme === "dark" ? "default" : "outline"}
                >
                  Dark
                </Button>
              </div>
            </div>
          </div>
          <p className="text-muted-foreground mt-4 text-sm">
            Uses useEffect to sync state with localStorage (persists across
            reloads)
          </p>
        </CardContent>
      </Card>
    </section>
  );
}

// ============================================================
// EXAMPLE 4: Optimistic UI Updates (React 19)
// ============================================================

function OptimisticUIExample() {
  const [items, setItems] = useState(["Item 1", "Item 2", "Item 3"]);
  const [optimisticItems, addOptimisticItem] = useOptimistic(
    items,
    (state, newItem: string) => [...state, newItem],
  );

  const [newItem, setNewItem] = useState("");

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newItem.trim()) return;

    // Show optimistic update immediately
    addOptimisticItem(newItem);
    const itemToAdd = newItem;
    setNewItem("");

    // Simulate server delay
    await new Promise((resolve) => setTimeout(resolve, 1000));

    // Update actual state
    setItems((current) => [...current, itemToAdd]);
    toast.success("Item added!");
  };

  return (
    <section>
      <h2 className="mb-4 text-2xl font-bold">
        4. Optimistic UI (React 19 useOptimistic)
      </h2>
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Optimistic Updates</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleAdd} className="mb-4 flex gap-2">
            <Input
              value={newItem}
              onChange={(e) => setNewItem(e.target.value)}
              placeholder="Add new item..."
            />
            <Button type="submit">Add</Button>
          </form>

          <div className="space-y-2">
            {optimisticItems.map((item, idx) => (
              <div
                key={idx}
                className="bg-muted flex items-center justify-between rounded p-2"
              >
                <span>{item}</span>
                {idx >= items.length && (
                  <span className="text-muted-foreground text-xs italic">
                    Adding...
                  </span>
                )}
              </div>
            ))}
          </div>

          <p className="text-muted-foreground mt-4 text-sm">
            Uses useOptimistic for instant UI feedback while server processes
            the request (notice &quot;Adding...&quot; state)
          </p>
        </CardContent>
      </Card>
    </section>
  );
}
