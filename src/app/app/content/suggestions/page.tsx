import { ContentSuggestions } from "./ContentSuggestions";

export default function ContentSuggestionsPage() {
  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 p-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">
          Content suggestions
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Confirm classifications and cross-account amplification before they
          alter the content graph.
        </p>
      </header>
      <ContentSuggestions />
    </div>
  );
}
