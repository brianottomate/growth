"use client";

import type * as React from "react";
import type { ControllerProps, FieldPath, FieldValues } from "react-hook-form";

import {
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { cn } from "@/lib/utils";

interface RadioGroupCardsOption {
  value: string;
  label: string;
  description?: string;
  icon?: React.ReactNode;
}

type Layout = "single" | "grid";

interface RadioGroupCardsFieldProps<
  TFieldValues extends FieldValues = FieldValues,
  TName extends FieldPath<TFieldValues> = FieldPath<TFieldValues>,
> extends Omit<ControllerProps<TFieldValues, TName>, "render"> {
  label?: string;
  description?: string;
  options: RadioGroupCardsOption[];
  className?: string;
  cardClassName?: string;
  layout?: Layout;
  gridCols?: number;
}

export function RadioGroupCardsField<
  TFieldValues extends FieldValues = FieldValues,
  TName extends FieldPath<TFieldValues> = FieldPath<TFieldValues>,
>({
  label,
  description,
  options,
  className,
  cardClassName,
  layout = "grid",
  gridCols = 2,
  ...props
}: RadioGroupCardsFieldProps<TFieldValues, TName>) {
  const getGridClassName = () => {
    if (layout === "single") {
      return "grid gap-3";
    }

    const columns = [
      "sm:grid-cols-1",
      "sm:grid-cols-2",
      "sm:grid-cols-3",
      "sm:grid-cols-4",
      "sm:grid-cols-5",
      "sm:grid-cols-6",
    ];
    const cols = Math.min(Math.max(gridCols, 1), 6);
    return cn(
      "grid gap-3",
      cols === 1 ? "grid-cols-1" : "grid-cols-2",
      columns[cols - 1],
    );
  };

  return (
    <FormField
      {...props}
      render={({ field }) => (
        <FormItem className={cn("space-y-3", className)}>
          {label && <FormLabel>{label}</FormLabel>}
          {description && (
            <p className="text-sm text-muted-foreground">{description}</p>
          )}
          <FormControl>
            <RadioGroup
              aria-label={label}
              onValueChange={field.onChange}
              value={field.value}
              className={getGridClassName()}
            >
              {options.map((option) => (
                <FormItem key={option.value} className="space-y-0">
                  <FormControl>
                    <label
                      htmlFor={`radio-${option.value}`}
                      className={cn(
                        layout === "grid"
                          ? "relative flex min-h-[80px] cursor-pointer items-start gap-3 rounded-lg border border-input p-4 shadow-sm transition-all focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/50 hover:border-ring has-[*[data-state=checked]]:border-primary has-[*[data-state=checked]]:bg-primary/5 has-[*[data-state=checked]]:ring-[3px] has-[*[data-state=checked]]:ring-primary/20 has-[:checked]:border-primary has-[:checked]:bg-primary/5 has-[:checked]:ring-[3px] has-[:checked]:ring-primary/20"
                          : "relative flex cursor-pointer items-center gap-3 rounded-lg border border-input p-4 shadow-sm transition-all focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/50 hover:border-ring has-[*[data-state=checked]]:border-primary has-[*[data-state=checked]]:bg-primary/5 has-[*[data-state=checked]]:ring-[3px] has-[*[data-state=checked]]:ring-primary/20 has-[:checked]:border-primary has-[:checked]:bg-primary/5 has-[:checked]:ring-[3px] has-[:checked]:ring-primary/20",
                        cardClassName,
                      )}
                    >
                      <RadioGroupItem
                        id={`radio-${option.value}`}
                        value={option.value}
                        className={cn("shrink-0", layout === "grid" && "mt-1")}
                      />
                      <div className="flex-1 space-y-1">
                        <div className="space-y-1">
                          <p
                            className={cn(
                              "text-sm font-medium",
                              layout === "grid"
                                ? "leading-tight"
                                : "leading-none",
                            )}
                          >
                            {option.label}
                          </p>
                          {option.description && (
                            <p
                              className={cn(
                                "text-xs text-muted-foreground",
                                layout === "grid" ? "leading-relaxed" : "",
                              )}
                            >
                              {option.description}
                            </p>
                          )}
                        </div>
                      </div>
                      {option.icon && (
                        <div className="absolute top-3 right-3 flex size-6 shrink-0 items-center justify-center text-muted-foreground">
                          {option.icon}
                        </div>
                      )}
                    </label>
                  </FormControl>
                </FormItem>
              ))}
            </RadioGroup>
          </FormControl>
          <FormMessage />
        </FormItem>
      )}
    />
  );
}
