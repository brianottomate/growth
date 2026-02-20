import Link from "next/link";
import { Check } from "lucide-react";
import { Button } from "@wandercom/design-system-web/ui/button";

interface Feature {
  label: string;
}

interface StickyCtaCardProps {
  title?: string;
  description?: string;
  trustBadge?: string;
  primaryButtonText?: string;
  primaryButtonHref?: string;
  secondaryButtonText?: string;
  secondaryButtonHref?: string;
  features?: Feature[];
}

export function StickyCtaCard({
  title = "Get Started Today",
  description = "Join thousands of users who have transformed their workflow. Start your free trial now.",
  trustBadge = "Trusted by 10,000+ users",
  primaryButtonText = "Start Free Trial",
  primaryButtonHref = "/signup",
  secondaryButtonText = "Learn More",
  secondaryButtonHref = "/",
  features = [
    { label: "No credit card required" },
    { label: "Free 14-day trial" },
    { label: "Cancel anytime" },
  ],
}: StickyCtaCardProps) {
  return (
    <div className="border-secondary bg-surface-secondary rounded-xl border p-6 shadow-sm">
      <h3 className="text-primary text-lg font-bold">{title}</h3>

      <p className="text-secondary mt-3 text-sm leading-relaxed">
        {description}
      </p>

      <div className="mt-4 flex items-center gap-2 text-xs font-medium text-amber-500">
        <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 20 20">
          <path
            fillRule="evenodd"
            d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z"
            clipRule="evenodd"
          />
        </svg>
        {trustBadge}
      </div>

      <div className="mt-6 space-y-2">
        <Button variant="primary" size="md" className="w-full" asChild>
          <Link href={primaryButtonHref}>{primaryButtonText}</Link>
        </Button>

        <Button variant="outline" size="md" className="w-full" asChild>
          <Link href={secondaryButtonHref}>{secondaryButtonText}</Link>
        </Button>
      </div>

      <div className="border-secondary mt-6 space-y-2 border-t pt-4">
        {features.map((feature, index) => (
          <div
            key={index}
            className="text-secondary flex items-start gap-2 text-xs"
          >
            <Check
              className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-500"
              strokeWidth={2.5}
            />
            <span>{feature.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
