import Link from "next/link";
import { CopyPrompt } from "./CopyPrompt";
import { BLOG_PROMPT_TEMPLATES, SHARED_BLOG_PROMPT } from "./prompts";

export default function BlogPromptBankPage() {
  return (
    <main className="mx-auto max-w-6xl px-6 py-12 text-primary">
      <Link
        href="/lab/blog-workbench"
        className="text-sm underline underline-offset-4"
      >
        Back to blog workbench
      </Link>
      <header className="mt-8 mb-8">
        <p className="text-sm text-secondary">Editorial toolkit</p>
        <h1 className="mt-2 text-4xl font-semibold tracking-tight">
          Blog prompt bank
        </h1>
        <p className="mt-4 max-w-3xl leading-relaxed text-secondary">
          Start with the shared guidance, then choose an article type. Replace
          the placeholders with reviewed facts and your assignment. These
          templates help write articles; they are separate from rental-search
          questions used to measure visibility.
        </p>
      </header>
      <section
        aria-labelledby="shared-heading"
        className="rounded-2xl border bg-surface-secondary p-6 sm:p-8"
      >
        <div className="flex flex-wrap items-center justify-between gap-4">
          <h2 id="shared-heading" className="text-2xl font-semibold">
            Shared guidance
          </h2>
          <CopyPrompt text={SHARED_BLOG_PROMPT} label="Copy shared prompt" />
        </div>
        <p className="mt-3 text-secondary">
          Reader decision first. Verified evidence. Concrete consequences.
          Selective homes and useful visuals.
        </p>
        <details className="mt-5 rounded-xl border bg-surface-primary p-4">
          <summary className="cursor-pointer font-medium">
            Read the shared prompt and required inputs
          </summary>
          <pre className="mt-4 max-h-[32rem] overflow-auto font-mono text-sm leading-relaxed break-words whitespace-pre-wrap text-secondary">
            {SHARED_BLOG_PROMPT}
          </pre>
        </details>
        <p className="mt-4 text-sm text-secondary">
          Shared editorial rules stay in sync with the workbench writer. Copying
          a template does not run the agent or publish an article.
        </p>
      </section>
      <nav aria-label="Article types" className="my-8 flex flex-wrap gap-2">
        {BLOG_PROMPT_TEMPLATES.map((template) => (
          <a
            key={template.id}
            href={`#${template.id}`}
            className="rounded-full border px-4 py-2 text-sm hover:bg-surface-secondary"
          >
            {template.title}
          </a>
        ))}
      </nav>
      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-2">
        {BLOG_PROMPT_TEMPLATES.map((template, index) => (
          <section
            key={template.id}
            id={template.id}
            aria-labelledby={`${template.id}-heading`}
            className="min-w-0 scroll-mt-8 rounded-2xl border p-6"
          >
            <p className="text-xs text-secondary">
              Article type {String(index + 1).padStart(2, "0")}
            </p>
            <h2
              id={`${template.id}-heading`}
              className="mt-2 text-xl font-semibold"
            >
              {template.title}
            </h2>
            <p className="mt-2 text-sm text-secondary">
              Example angle: {template.example}
            </p>
            <pre className="my-5 rounded-xl bg-surface-secondary p-4 font-mono text-sm leading-relaxed break-words whitespace-pre-wrap">
              {template.prompt}
            </pre>
            <CopyPrompt
              text={`${SHARED_BLOG_PROMPT}\n\nARTICLE TYPE: ${template.title}\n${template.prompt}`}
              label="Copy complete prompt"
            />
          </section>
        ))}
      </div>
    </main>
  );
}
