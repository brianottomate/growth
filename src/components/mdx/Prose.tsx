export function Prose({ children }: { children: React.ReactNode }) {
  return (
    <div className="article-prose prose max-w-none lg:prose-lg">{children}</div>
  );
}
