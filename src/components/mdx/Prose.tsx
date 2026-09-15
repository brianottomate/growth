export function Prose({ children }: { children: React.ReactNode }) {
  return (
    <div className="prose max-w-none prose-gray lg:prose-lg dark:prose-invert">
      {children}
    </div>
  );
}
