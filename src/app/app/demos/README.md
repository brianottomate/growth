# Next.js Best Practices Demos

A comprehensive collection of production-ready patterns and best practices for building modern Next.js applications.

## 📁 Demo Structure

```
/app/demos/
├── page.tsx                    # Demo index (landing page)
├── server-components/          # Server Component patterns
├── client-components/          # Client Component patterns
├── forms/                      # Form handling with react-hook-form + zod
├── data-fetching/             # tRPC patterns
├── file-upload/               # File uploads with Vercel Blob
├── loading-states/            # Loading & error patterns
└── auth-patterns/             # Authentication patterns
```

## 🎯 What's Included

### 1. Server Components ([/app/demos/server-components](./server-components))
- Direct database access in components
- Async component patterns
- Suspense boundaries
- Progressive rendering & streaming
- Multiple loading states

**Key Learnings:**
- When to use Server Components vs Client Components
- How to fetch data without API routes
- Proper Suspense boundary placement

### 2. Client Components ([/app/demos/client-components](./client-components))
- State management with useState
- Event handlers and interactivity
- Browser API usage (localStorage)
- React 19 features (useOptimistic)
- Composition patterns (Server → Client → Server)

**Key Learnings:**
- When Client Components are necessary
- How to keep Client Components minimal
- Proper use of "use client" directive

### 3. Forms & Validation ([/app/demos/forms](./forms))
- react-hook-form integration
- zod schema validation
- Server Action integration
- Real-time validation feedback
- Complex form rules (cross-field validation)
- Error handling and display

**Key Learnings:**
- Type-safe form validation
- Client + server validation patterns
- Proper form state management

### 4. Data Fetching - tRPC ([/app/demos/data-fetching](./data-fetching))
- Type-safe API calls
- Queries (useQuery)
- Mutations (useMutation)
- Optimistic updates
- Cache invalidation
- Error handling

**Key Learnings:**
- End-to-end type safety with tRPC
- When to use queries vs mutations
- Optimistic UI patterns

### 5. File Upload ([/app/demos/file-upload](./file-upload))
- Drag-and-drop with react-dropzone
- Vercel Blob storage integration
- File validation (type, size)
- Multiple file uploads
- Image previews
- Upload progress

**Key Learnings:**
- Client-side file validation
- Server Action file uploads
- Preview generation

### 6. Loading & Error States ([/app/demos/loading-states](./loading-states))
- loading.tsx convention
- error.tsx convention
- Suspense boundaries
- Skeleton loaders
- Error boundaries
- Streaming patterns

**Key Learnings:**
- Route-level vs component-level loading
- Error boundary implementation
- Progressive page rendering

### 7. Authentication Patterns ([/app/demos/auth-patterns](./auth-patterns))
- Server-side session checking
- Protected routes
- Role-based access control (RBAC)
- tRPC auth middleware
- Client-side auth checks

**Key Learnings:**
- Better Auth integration
- Route protection patterns
- Session management

## 🚀 Tech Stack

These demos showcase:

- **Next.js 16** - App Router, Server Components, Server Actions
- **React 19** - useOptimistic, enhanced hooks
- **TypeScript** - Full type safety
- **tRPC** - End-to-end type-safe APIs
- **Drizzle ORM** - Type-safe database queries
- **Better Auth** - Modern authentication
- **react-hook-form** - Performant form handling
- **zod** - Schema validation
- **Vercel Blob** - File storage
- **TanStack Query** - Data fetching & caching
- **Radix UI** - Accessible UI components
- **Tailwind CSS 4** - Utility-first styling

## 📖 How to Use These Demos

### For Learning
1. **Read the Code**: Each demo file has extensive comments explaining patterns
2. **Try Modifications**: Change values, add features, break things to learn
3. **Check Console**: Many demos log useful debugging info
4. **Read Docs**: Links to official docs are provided in comments

### For Your Projects
1. **Copy Patterns**: These are production-ready patterns you can copy
2. **Adapt to Needs**: Modify to fit your specific requirements
3. **Keep Best Practices**: The core patterns should remain the same
4. **Test Thoroughly**: Always test copied code in your context

## 🎓 Learning Path

**Recommended order for newcomers:**

1. **Server Components** - Understand the foundation
2. **Client Components** - Learn when interactivity is needed
3. **Loading States** - Handle async operations properly
4. **Forms** - Master form handling
5. **Data Fetching** - Type-safe API calls
6. **Auth Patterns** - Secure your application
7. **File Upload** - Handle file operations

## 💡 Key Takeaways

### Server vs Client Components
- **Server by default** - Only use Client when you need interactivity
- **Granular boundaries** - Keep Client Components small and focused
- **Composition** - Server Components can pass Server Components to Client Components as children

### Data Fetching
- **Server Components** - Fetch directly in components (no API routes needed)
- **Client Components** - Use tRPC for type-safe API calls
- **Caching** - Leverage React Query's automatic caching

### Forms
- **react-hook-form** - For performant form state
- **zod** - For schema validation and type inference
- **Server Actions** - For type-safe form submission

### Loading & Errors
- **Suspense** - For granular loading boundaries
- **loading.tsx** - For route-level loading UI
- **error.tsx** - For error boundaries
- **Streaming** - For progressive rendering

### Authentication
- **Server-side first** - Check auth in Server Components
- **Middleware** - For route-level protection
- **RBAC** - Role-based access for admin features

## 🔗 Additional Resources

- [Next.js Docs](https://nextjs.org/docs)
- [React 19 Docs](https://react.dev)
- [tRPC Docs](https://trpc.io/docs)
- [Drizzle ORM Docs](https://orm.drizzle.team)
- [Better Auth Docs](https://better-auth.com)
- [react-hook-form Docs](https://react-hook-form.com)
- [zod Docs](https://zod.dev)
- [TanStack Query Docs](https://tanstack.com/query)

## 🤝 Contributing

These demos are part of the Native template. If you find issues or have suggestions:
1. Test your changes thoroughly
2. Maintain the same code quality and documentation style
3. Ensure all demos still work together

## 📝 Notes

- All demos use simulated delays (`setTimeout`) to demonstrate loading states
- Database operations use the actual Drizzle schema but may need seeded data
- File uploads use Vercel Blob (requires `BLOB_READ_WRITE_TOKEN` env var)
- Auth demos require a logged-in session to show full functionality

---

**Happy coding!** 🚀

These demos represent production-ready patterns used in modern Next.js applications. Use them as reference implementations for your own features.
