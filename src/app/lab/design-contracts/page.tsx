"use client";

import { useState } from "react";
import { useTheme } from "@/components/ui/theme";
import { CalendarIcon, MoreHorizontal, Search, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DatePicker } from "@/components/ui/date-picker";
import { StatCard } from "@/components/ui/stat-card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";

export default function DesignContractsReview() {
  const { resolvedTheme: theme, setTheme } = useTheme();
  const [date, setDate] = useState<Date>();
  const [status, setStatus] = useState("Draft");
  return (
    <main
      data-theme={theme}
      className="min-h-screen bg-background p-5 text-foreground sm:p-10"
    >
      <div className="mx-auto max-w-5xl space-y-8">
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">Growth · UI review</p>
            <h1 className="text-2xl font-semibold">
              Shared component treatments
            </h1>
            <p className="max-w-xl text-sm text-muted-foreground">
              Fictional campaign controls for reviewing the style cleanup.
              Actions update this page only.
            </p>
          </div>
          <Button
            variant="outline"
            onClick={() => setTheme(theme === "light" ? "dark" : "light")}
          >
            Switch to {theme === "light" ? "dark" : "light"}
          </Button>
        </header>
        <section className="grid gap-5 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Campaign actions</CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="flex flex-wrap items-center gap-3">
                <Button
                  density="editorial"
                  shape="round"
                  onClick={() => setStatus("Ready")}
                >
                  Prepare campaign
                </Button>
                <Button
                  density="editorial"
                  shape="round"
                  variant="outline"
                  onClick={() => setStatus("Draft")}
                >
                  Reset sample
                </Button>
                <Badge textSize="caption">{status}</Badge>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <Button variant="ghost" size="sm" tone="muted-active">
                  Edit details
                </Button>
                <Button variant="ghost" size="sm" tone="muted-danger">
                  <Trash2 /> Remove sample
                </Button>
                <DropdownMenu>
                  <DropdownMenuTrigger
                    appearance="icon"
                    aria-label="Sample options"
                  >
                    <MoreHorizontal className="size-4" />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent>
                    <DropdownMenuLabel textSize="eyebrow" tone="muted">
                      Campaign
                    </DropdownMenuLabel>
                    <DropdownMenuItem onSelect={() => setStatus("Archived")}>
                      Archive sample
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
              <div className="flex items-center gap-3">
                <Avatar frame="surface">
                  <AvatarFallback tone="primary" textSize="xs">
                    WG
                  </AvatarFallback>
                </Avatar>
                <span className="text-sm">Growth team</span>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Form controls</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Label htmlFor="sample-name" textSize="xs" tone="muted">
                Campaign name
              </Label>
              <Input
                id="sample-name"
                textSize="xs"
                defaultValue="Autumn launch"
              />
              <div className="relative">
                <Search className="absolute top-2.5 left-2.5 size-4 text-muted-foreground" />
                <Input
                  aria-label="Search sample"
                  leading="search"
                  placeholder="Search homes"
                />
              </div>
              <Input
                aria-label="Available handle"
                tone="success"
                defaultValue="autumn-launch"
              />
              <Input
                aria-label="Invalid handle"
                tone="error"
                aria-invalid
                defaultValue="needs review"
              />
              <DatePicker
                value={date}
                onChange={setDate}
                density="form"
                placeholder="Choose sample date"
              />
              <Textarea
                aria-label="Sample direction"
                textSize="xs"
                placeholder="Campaign direction"
              />
            </CardContent>
          </Card>
        </section>
        <section className="grid gap-5 sm:grid-cols-2">
          <StatCard
            label="Sample bookings"
            value="128"
            presentation="wall"
            hint="Fictional review data"
          />
          <Card tone="error">
            <CardHeader>
              <CardTitle tone="error">Validation treatment</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm">
                An invalid selection stays visible alongside the field.
              </p>
            </CardContent>
          </Card>
        </section>
        <section className="rounded-xl bg-gradient-to-br from-slate-700 to-slate-950 p-6">
          <div className="flex flex-wrap items-center gap-3">
            <Badge tone="media">Media preview</Badge>
            <Button
              variant="secondary"
              tone="media"
              size="icon"
              aria-label="Media sample"
            >
              <CalendarIcon />
            </Button>
            <Button variant="outline" tone="media-outline">
              Choose image
            </Button>
            <Dialog>
              <DialogTrigger asChild>
                <Button variant="ghost" tone="media-ghost">
                  Open media dialog
                </Button>
              </DialogTrigger>
              <DialogContent tone="media">
                <DialogHeader divider="media">
                  <DialogTitle tone="media">Sample media preview</DialogTitle>
                  <DialogDescription tone="media">
                    Check the desktop dialog and mobile drawer.
                  </DialogDescription>
                </DialogHeader>
                <div className="grid aspect-video place-items-center rounded-md bg-slate-800 text-sm text-white">
                  Fictional media
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </section>
      </div>
    </main>
  );
}
