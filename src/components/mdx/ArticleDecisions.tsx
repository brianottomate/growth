import type { ReactNode } from "react";

export type ArticleAnswer = {
  priority: string;
  answer: string;
  reason?: string;
};

export function ArticleQuickAnswers({
  title = "Choose by your priorities",
  answers,
}: {
  title?: string;
  answers: ArticleAnswer[];
}) {
  return (
    <section
      className="not-prose my-8 rounded-2xl border border-current/15 p-6"
      aria-label={title}
    >
      <h3 className="mb-4 text-xl font-semibold">{title}</h3>
      <dl className="divide-y divide-current/15">
        {answers.map((item, index) => (
          <div
            key={`${item.priority}-${index}`}
            className="grid grid-cols-1 gap-2 py-4 sm:grid-cols-[1fr_2fr]"
          >
            <dt className="font-semibold">{item.priority}</dt>
            <dd>
              <p>{item.answer}</p>
              {item.reason ? (
                <p className="mt-1 text-sm leading-relaxed text-secondary">
                  {item.reason}
                </p>
              ) : null}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

/** Real table semantics, with local scrolling rather than overflowing the article on phones. */
export function ArticleComparison({
  caption,
  columns,
  rows,
  sourceNote,
}: {
  caption: string;
  columns: string[];
  rows: string[][];
  sourceNote?: string;
}) {
  return (
    <figure className="not-prose my-8">
      <div
        className="overflow-x-auto rounded-2xl border border-current/15 focus-visible:outline-2 focus-visible:outline-offset-4"
        role="region"
        aria-label={`${caption}: scroll to compare columns`}
        tabIndex={0}
      >
        <table className="w-full min-w-[36rem] text-left text-sm">
          <caption className="px-5 py-4 text-left text-lg font-semibold">
            {caption}
          </caption>
          <thead>
            <tr>
              {columns.map((column, index) => (
                <th
                  key={`${column}-${index}`}
                  scope="col"
                  className="border-b border-current/15 bg-current/5 px-5 py-3 font-semibold"
                >
                  {column}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr key={index}>
                {columns.map((_, cellIndex) =>
                  cellIndex === 0 ? (
                    <th
                      key={cellIndex}
                      scope="row"
                      className="border-b border-current/10 px-5 py-4 font-medium"
                    >
                      {row[cellIndex] ?? "Not supplied"}
                    </th>
                  ) : (
                    <td
                      key={cellIndex}
                      className="border-b border-current/10 px-5 py-4 leading-relaxed"
                    >
                      {row[cellIndex] ?? "Not supplied"}
                    </td>
                  ),
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {sourceNote ? (
        <figcaption className="mt-2 text-sm text-secondary">
          {sourceNote}
        </figcaption>
      ) : null}
    </figure>
  );
}

export function ArticleTradeoffs({
  title,
  benefits,
  cautions,
  benefitLabel = "Why it fits",
  cautionLabel = "Plan around",
}: {
  title: string;
  benefits: string[];
  cautions: string[];
  benefitLabel?: string;
  cautionLabel?: string;
}) {
  return (
    <section className="not-prose my-8" aria-label={title}>
      <h3 className="mb-4 text-xl font-semibold">{title}</h3>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {[
          { label: benefitLabel, items: benefits },
          { label: cautionLabel, items: cautions },
        ].map((group) => (
          <div
            key={group.label}
            className="rounded-2xl border border-current/15 p-5"
          >
            <h4 className="font-semibold">{group.label}</h4>
            <ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-relaxed text-current/75">
              {group.items.map((item, index) => (
                <li key={index}>{item}</li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}

export function ArticleFigure({
  src,
  alt,
  caption,
  credit,
  creditHref,
}: {
  src: string;
  alt: string;
  caption?: string;
  credit?: string;
  creditHref?: string;
}) {
  return (
    <figure className="my-8">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={alt}
        loading="lazy"
        className="h-auto w-full rounded-2xl"
      />
      {caption || credit ? (
        <figcaption>
          {caption ? <span className="block">{caption}</span> : null}
          {credit ? (
            <span className="block text-sm">
              {creditHref ? (
                <a href={creditHref} target="_blank" rel="noopener noreferrer">
                  {credit}
                </a>
              ) : (
                credit
              )}
            </span>
          ) : null}
        </figcaption>
      ) : null}
    </figure>
  );
}

/** An announcement section separates the shipped change from its reader benefit. */
export function ArticleUpdate({
  title,
  benefit,
  image,
  alt,
  children,
}: {
  title: string;
  benefit: string;
  image?: string;
  alt?: string;
  children: ReactNode;
}) {
  return (
    <section className="my-10">
      <h2>{title}</h2>
      <div>{children}</div>
      <aside className="not-prose my-5 rounded-xl border-l-4 border-current/25 bg-current/5 p-5">
        <h3 className="font-semibold">Why it matters</h3>
        <p className="mt-2 leading-relaxed text-current/75">{benefit}</p>
      </aside>
      {image ? <ArticleFigure src={image} alt={alt ?? title} /> : null}
    </section>
  );
}
