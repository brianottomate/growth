import Link from "next/link";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default function DemosPage() {
  const demos = [
    {
      title: "Server Components",
      description: "Server-side rendering, data fetching, and RSC patterns",
      href: "/app/demos/server-components",
      topics: ["RSC", "Server Actions", "Streaming", "Suspense"],
    },
    {
      title: "Client Components",
      description: "Interactive UI, state management, and client-side patterns",
      href: "/app/demos/client-components",
      topics: ["useState", "useEffect", "Event Handlers", "useOptimistic"],
    },
    {
      title: "Forms & Validation",
      description:
        "Form handling with react-hook-form, zod validation, and server actions",
      href: "/app/demos/forms",
      topics: ["react-hook-form", "zod", "Server Actions", "Validation"],
    },
    {
      title: "Data Fetching (tRPC)",
      description: "Type-safe API calls, mutations, optimistic updates",
      href: "/app/demos/data-fetching",
      topics: ["tRPC", "useQuery", "useMutation", "Optimistic UI"],
    },
    {
      title: "File Upload",
      description: "File uploads with drag-and-drop, Vercel Blob storage",
      href: "/app/demos/file-upload",
      topics: ["react-dropzone", "Vercel Blob", "Progress", "Validation"],
    },
    {
      title: "Loading & Error States",
      description: "Loading skeletons, error boundaries, and suspense",
      href: "/app/demos/loading-states",
      topics: ["loading.tsx", "error.tsx", "Suspense", "ErrorBoundary"],
    },
    {
      title: "Authentication Patterns",
      description: "Protected routes, session handling, and auth utilities",
      href: "/app/demos/auth-patterns",
      topics: ["Better Auth", "Middleware", "Protected Routes", "Sessions"],
    },
  ];

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-8">
        <h1 className="mb-2 text-4xl font-bold">
          Next.js Best Practices Demos
        </h1>
        <p className="text-muted-foreground text-lg">
          Explore patterns and best practices for building modern Next.js
          applications
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {demos.map((demo) => (
          <Link key={demo.href} href={demo.href}>
            <Card className="h-full transition-all hover:scale-[1.02] hover:shadow-lg">
              <CardHeader>
                <CardTitle>{demo.title}</CardTitle>
                <CardDescription>{demo.description}</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-2">
                  {demo.topics.map((topic) => (
                    <span
                      key={topic}
                      className="bg-primary/10 text-primary rounded-md px-2 py-1 text-xs"
                    >
                      {topic}
                    </span>
                  ))}
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      <div className="bg-muted mt-12 rounded-lg p-6">
        <h2 className="mb-4 text-2xl font-bold">About These Demos</h2>
        <div className="text-muted-foreground space-y-4">
          <p>
            These demos showcase production-ready patterns using the latest
            Next.js 16 features with React 19, including:
          </p>
          <ul className="ml-4 list-inside list-disc space-y-2">
            <li>Server Components and Server Actions</li>
            <li>Type-safe API calls with tRPC</li>
            <li>Form validation with zod and react-hook-form</li>
            <li>File uploads with Vercel Blob</li>
            <li>Authentication with Better Auth</li>
            <li>Database operations with Drizzle ORM</li>
            <li>Modern UI with Radix UI and Tailwind CSS</li>
          </ul>
          <p>
            Each demo includes detailed comments explaining the patterns and
            best practices. Use these as reference implementations for your own
            features.
          </p>
        </div>
      </div>
    </div>
  );
}
