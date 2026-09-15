import {
  Calendar,
  ChartBar,
  ChartLine,
  Clock,
  Code,
  Cog,
  File,
  Heart,
  Layers,
  Lightbulb,
  Link as LinkIcon,
  ShieldCheck,
  Sparkles,
  Star,
  Target,
  Users,
  XCircle,
  Zap,
} from "lucide-react";
import Image from "next/image";

interface Feature {
  title: string;
  description: string;
  icon?: string;
  image?: string;
  imageAlt?: string;
}

interface FeatureGridProps {
  features: Feature[];
  variant?: "default" | "showcase";
}

const iconMap: Record<string, React.ComponentType<{ className?: string }>> = {
  calendar: Calendar,
  "shield-check": ShieldCheck,
  code: Code,
  document: File,
  "lightning-bolt": Zap,
  lightbulb: Lightbulb,
  layers: Layers,
  "chart-bar": ChartBar,
  star: Star,
  users: Users,
  cog: Cog,
  link: LinkIcon,
  "chart-line": ChartLine,
  heart: Heart,
  clock: Clock,
  sparkles: Sparkles,
  target: Target,
  "x-circle": XCircle,
};

export function FeatureGrid({
  features,
  variant = "default",
}: FeatureGridProps) {
  if (variant === "showcase") {
    return (
      <div className="my-8 grid gap-6 sm:grid-cols-2">
        {features.map((feature, index) => (
          <div
            key={index}
            className="group relative overflow-hidden rounded-lg border border-secondary bg-surface-secondary shadow-sm transition-all duration-200 hover:shadow-md"
          >
            {feature.image && (
              <div className="relative aspect-video w-full overflow-hidden bg-surface-tertiary">
                <Image
                  src={feature.image}
                  alt={feature.imageAlt || feature.title}
                  fill
                  className="object-cover transition-transform duration-200 group-hover:scale-105"
                />
              </div>
            )}
            <div className="p-6">
              {feature.icon && iconMap[feature.icon] && (
                <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-lg bg-surface-tertiary">
                  {(() => {
                    const IconComponent = iconMap[feature.icon];
                    // @ts-expect-error - this is ok
                    return <IconComponent className="h-6 w-6 text-primary" />;
                  })()}
                </div>
              )}
              <h3 className="mb-2 text-xl font-semibold text-primary">
                {feature.title}
              </h3>
              <p className="text-sm leading-relaxed text-secondary">
                {feature.description}
              </p>
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="my-8 grid gap-6 sm:grid-cols-2">
      {features.map((feature, index) => {
        const IconComponent = feature.icon ? iconMap[feature.icon] : null;

        return (
          <div
            key={index}
            className="rounded-lg border border-secondary bg-surface-secondary p-6"
          >
            {IconComponent && (
              <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-lg bg-surface-tertiary">
                <IconComponent className="h-6 w-6 text-primary" />
              </div>
            )}
            <h3 className="mb-2 text-lg font-semibold text-primary">
              {feature.title}
            </h3>
            <p className="text-secondary">{feature.description}</p>
          </div>
        );
      })}
    </div>
  );
}
