import Footer from "./Footer";
import Header from "./Header";

// Title template + branded defaults are inherited from the root layout
// (`rootMetadata` in `@/lib/metadata`). Marketing pages set their own
// title/eyebrow via `constructMetadata`.

export default function MarketingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="bg-background">
      <Header container />
      <main className="isolate">{children}</main>
      <Footer />
    </div>
  );
}
