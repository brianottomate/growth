export function Prose({ children }: { children: React.ReactNode }) {
  return (
    <div className="prose prose-gray dark:prose-invert lg:prose-lg max-w-none">{children}</div>
  );
}
