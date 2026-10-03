import Link from "next/link";
import { Button } from "@wandercom/design-system-web/ui/button";
import { ArrowRight, Check } from "lucide-react";

interface Feature {
  label: string;
  description?: string;
}

interface CtaCardProps {
  title: string;
  description: string;
  buttonText: string;
  buttonHref: string;
  features?: Feature[];
}

export function CtaCard({
  title,
  description,
  buttonText,
  buttonHref,
  features,
}: CtaCardProps) {
  const displayFeatures = features ?? [];

  return (
    <section className="not-prose relative my-8 overflow-hidden rounded-xl border border-secondary bg-surface-secondary shadow-lg transition-shadow hover:shadow-xl">
      <div className="relative z-10 p-6 sm:p-8">
        <h2 className="text-[1.75rem] leading-[110%] font-bold tracking-tight text-primary">
          {title}
        </h2>

        <div className="mt-2.5 text-lg leading-[160%] text-secondary">
          <p>{description}</p>
        </div>

        <ul className="mt-5 space-y-2.5">
          {displayFeatures.map((feature, index) => (
            <li key={index} className="flex items-start gap-2.5">
              <span className="mt-0.5 block flex-none">
                <Check className="size-5 text-emerald-500" strokeWidth={2.5} />
              </span>
              <span className="block flex-1 text-[15px] leading-relaxed">
                <span className="font-semibold text-primary">
                  {feature.label}
                  {feature.description && ": "}
                </span>
                {feature.description && (
                  <span className="text-secondary">{feature.description}</span>
                )}
              </span>
            </li>
          ))}
        </ul>

        <div className="mt-6 flex items-center gap-1">
          <Button asChild size="lg">
            <Link href={buttonHref} className="group gap-2">
              <p>{buttonText}</p>
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
            </Link>
          </Button>
        </div>
      </div>

      <div
        aria-hidden="true"
        className="pointer-events-none absolute right-0 bottom-0 z-0 translate-x-[40%] translate-y-[43%] rotate-12 select-none"
      >
        <div className="size-[38rem] rounded-full bg-linear-to-br from-amber-400 to-amber-600 opacity-20 blur-3xl" />
      </div>
    </section>
  );
}
