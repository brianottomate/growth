"use client";

import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";

export function MetaAccountSubmit() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Saving and checking…" : "Use this ad account"}
    </Button>
  );
}
