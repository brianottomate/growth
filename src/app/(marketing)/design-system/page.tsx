"use client";

import { Button } from "@wandercom/design-system-web/ui/button";
import { Badge } from "@wandercom/design-system-web/ui/badge";
import { Input } from "@wandercom/design-system-web/ui/input";
import { Switch } from "@wandercom/design-system-web/ui/switch";
import { Checkbox } from "@wandercom/design-system-web/ui/checkbox";
import { Avatar } from "@wandercom/design-system-web/ui/avatar";
import { Label } from "@wandercom/design-system-web/ui/label";
import { Separator } from "@wandercom/design-system-web/ui/separator";
import { Progress } from "@wandercom/design-system-web/ui/progress";
import { Spinner } from "@wandercom/design-system-web/ui/spinner";
import { Heading } from "@wandercom/design-system-web/ui/heading";
import { Text } from "@wandercom/design-system-web/ui/text";
import { Textarea } from "@wandercom/design-system-web/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@wandercom/design-system-web/ui/select";
import {
  RadioGroup,
  RadioGroupItem,
} from "@wandercom/design-system-web/ui/radio-group";
import { Toggle } from "@wandercom/design-system-web/ui/toggle";
import {
  ToggleGroup,
  ToggleGroupItem,
} from "@wandercom/design-system-web/ui/toggle-group";
import {
  ModalContent,
  ModalDescription,
  ModalFooter,
  ModalHeader,
  ModalRoot,
  ModalTitle,
  ModalTrigger,
} from "@wandercom/design-system-web/ui/modal";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@wandercom/design-system-web/ui/tooltip";
import { Icon } from "@wandercom/design-system-icons";
import { useState } from "react";

export default function DesignSystemPage() {
  const [switchChecked, setSwitchChecked] = useState(false);
  const [checkboxChecked, setCheckboxChecked] = useState(false);
  const [selectValue, setSelectValue] = useState("");
  const [radioValue, setRadioValue] = useState("option-one");
  const [togglePressed, setTogglePressed] = useState(false);
  const [toggleGroupValue, setToggleGroupValue] = useState("left");
  const [modalOpen, setModalOpen] = useState(false);

  return (
    <div className="container mx-auto py-12">
      <div className="mx-auto max-w-6xl space-y-12">
        {/* Header */}
        <div>
          <h1 className="mb-4 text-4xl font-bold">Wander Design System</h1>
          <p className="text-muted-foreground text-lg">
            A showcase of components from{" "}
            <code className="bg-muted rounded px-2 py-1 text-sm">
              @wandercom/design-system-web
            </code>
          </p>
        </div>

        {/* Typography Section */}
        <section>
          <h2 className="mb-6 text-2xl font-semibold">Typography</h2>
          <div className="space-y-8">
            {/* Headings */}
            <div>
              <h3 className="text-muted-foreground mb-4 text-sm font-medium">
                Heading Variants (using Instrument Sans)
              </h3>
              <div className="space-y-4">
                <div>
                  <Heading variant="display-lg">Display Large Heading</Heading>
                  <code className="text-muted-foreground text-xs">
                    variant=&quot;display-lg&quot;
                  </code>
                </div>
                <div>
                  <Heading variant="display">Display Heading</Heading>
                  <code className="text-muted-foreground text-xs">
                    variant=&quot;display&quot;
                  </code>
                </div>
                <div>
                  <Heading variant="display-sm">Display Small Heading</Heading>
                  <code className="text-muted-foreground text-xs">
                    variant=&quot;display-sm&quot;
                  </code>
                </div>
                <div>
                  <Heading variant="headline-lg">Headline Large</Heading>
                  <code className="text-muted-foreground text-xs">
                    variant=&quot;headline-lg&quot;
                  </code>
                </div>
                <div>
                  <Heading variant="headline">Headline</Heading>
                  <code className="text-muted-foreground text-xs">
                    variant=&quot;headline&quot;
                  </code>
                </div>
                <div>
                  <Heading variant="headline-sm">Headline Small</Heading>
                  <code className="text-muted-foreground text-xs">
                    variant=&quot;headline-sm&quot;
                  </code>
                </div>
              </div>
            </div>

            <Separator />

            {/* Text Variants */}
            <div>
              <h3 className="text-muted-foreground mb-4 text-sm font-medium">
                Text Variants (using Instrument Sans)
              </h3>
              <div className="space-y-4">
                <div>
                  <Text variant="body-lg-long">
                    Body Large Long - Perfect for longer paragraphs that need
                    increased line height for better readability.
                  </Text>
                  <code className="text-muted-foreground text-xs">
                    variant=&quot;body-lg-long&quot;
                  </code>
                </div>
                <div>
                  <Text variant="body-lg">
                    Body Large - Great for prominent body text and
                    introductions.
                  </Text>
                  <code className="text-muted-foreground text-xs">
                    variant=&quot;body-lg&quot;
                  </code>
                </div>
                <div>
                  <Text variant="body-long">
                    Body Long - Standard body text with increased line height
                    for comfortable reading of longer content.
                  </Text>
                  <code className="text-muted-foreground text-xs">
                    variant=&quot;body-long&quot;
                  </code>
                </div>
                <div>
                  <Text variant="body">
                    Body - Default body text for general content.
                  </Text>
                  <code className="text-muted-foreground text-xs">
                    variant=&quot;body&quot;
                  </code>
                </div>
                <div>
                  <Text variant="body-sm">
                    Body Small - Smaller text for captions and secondary
                    content.
                  </Text>
                  <code className="text-muted-foreground text-xs">
                    variant=&quot;body-sm&quot;
                  </code>
                </div>
              </div>
            </div>

            <Separator />

            {/* Text Weights & Colors */}
            <div>
              <h3 className="text-muted-foreground mb-4 text-sm font-medium">
                Text Weights & Colors
              </h3>
              <div className="space-y-6">
                {/* Font Weights */}
                <div className="space-y-2">
                  <Text variant="body" weight="normal">
                    Normal weight (450)
                  </Text>
                  <Text variant="body" weight="medium">
                    Medium weight (550)
                  </Text>
                </div>

                {/* Basic Color Hierarchy */}
                <div className="space-y-2">
                  <Text variant="body" color="primary">
                    Primary - Main body text and content
                  </Text>
                  <Text variant="body" color="secondary">
                    Secondary - Supportive text and descriptions
                  </Text>
                  <Text variant="body" color="tertiary">
                    Tertiary - Subtle text and captions
                  </Text>
                </div>

                {/* Practical Secondary Text Examples */}
                <div className="border-primary space-y-4 rounded-lg border p-4">
                  <div className="space-y-1">
                    <Text variant="body-lg" weight="medium" color="primary">
                      Property Title
                    </Text>
                    <Text variant="body" color="secondary">
                      Secondary text works great for descriptions and supporting
                      details below a title.
                    </Text>
                  </div>

                  <Separator />

                  <div className="space-y-1">
                    <Text variant="body" weight="medium" color="primary">
                      User Settings
                    </Text>
                    <Text variant="body-sm" color="secondary">
                      Secondary color is ideal for helper text and input
                      descriptions that guide users without competing with
                      primary content.
                    </Text>
                  </div>

                  <Separator />

                  <div className="flex items-baseline gap-2">
                    <Text variant="body-lg" weight="medium" color="primary">
                      $299
                    </Text>
                    <Text variant="body-sm" color="secondary">
                      per night
                    </Text>
                  </div>

                  <Separator />

                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <Text variant="body" weight="medium" color="primary">
                        John Doe
                      </Text>
                      <Text variant="body-sm" color="secondary">
                        2 hours ago
                      </Text>
                    </div>
                    <Text variant="body" color="primary">
                      This is a comment with primary text.
                    </Text>
                    <Text variant="body-sm" color="secondary">
                      Metadata like timestamps work perfectly as secondary text.
                    </Text>
                  </div>
                </div>

                <div className="bg-surface-secondary rounded-lg p-4">
                  <Text variant="body-sm" color="tertiary" weight="medium">
                    💡 TIP: Use secondary for descriptions, metadata, captions,
                    and supporting information. Use tertiary for even more
                    subtle text like placeholders or disabled states.
                  </Text>
                </div>
              </div>
            </div>

            <Separator />

            {/* Responsive Typography */}
            <div>
              <h3 className="text-muted-foreground mb-4 text-sm font-medium">
                Responsive Typography
              </h3>
              <div className="space-y-4">
                <div>
                  <Heading
                    variant={{
                      base: "headline-sm",
                      md: "headline",
                      lg: "display",
                    }}
                  >
                    Responsive Heading (resize to see)
                  </Heading>
                  <code className="text-muted-foreground text-xs">
                    variant=&#123;&#123; base: &quot;headline-sm&quot;, md:
                    &quot;headline&quot;, lg: &quot;display&quot; &#125;&#125;
                  </code>
                </div>
                <div>
                  <Text
                    variant={{ base: "body-sm", md: "body", lg: "body-lg" }}
                  >
                    Responsive text that scales from small to large across
                    breakpoints.
                  </Text>
                  <code className="text-muted-foreground text-xs">
                    variant=&#123;&#123; base: &quot;body-sm&quot;, md:
                    &quot;body&quot;, lg: &quot;body-lg&quot; &#125;&#125;
                  </code>
                </div>
              </div>
            </div>
          </div>
        </section>

        <Separator />

        {/* Buttons Section */}
        <section>
          <h2 className="mb-6 text-2xl font-semibold">Buttons</h2>
          <div className="space-y-6">
            <div>
              <h3 className="text-muted-foreground mb-3 text-sm font-medium">
                Variants
              </h3>
              <div className="flex flex-wrap gap-3">
                <Button variant="primary">Primary</Button>
                <Button variant="secondary">Secondary</Button>
                <Button variant="outline">Outline</Button>
                <Button variant="ghost">Ghost</Button>
                <Button variant="destructive">Destructive</Button>
                <Button variant="link">Link</Button>
              </div>
            </div>

            <div>
              <h3 className="text-muted-foreground mb-3 text-sm font-medium">
                Sizes
              </h3>
              <div className="flex flex-wrap items-center gap-3">
                <Button size="xs">Extra Small</Button>
                <Button size="sm">Small</Button>
                <Button size="md">Medium</Button>
                <Button size="lg">Large</Button>
              </div>
            </div>

            <div>
              <h3 className="text-muted-foreground mb-3 text-sm font-medium">
                Icon Buttons
              </h3>
              <div className="flex flex-wrap items-center gap-3">
                <Button size="icon-xs" variant="outline">
                  <Icon name="heart-wishlist" size="sm" />
                </Button>
                <Button size="icon-sm" variant="outline">
                  <Icon name="heart-wishlist" size="sm" />
                </Button>
                <Button size="icon-md" variant="outline">
                  <Icon name="heart-wishlist" size="md" />
                </Button>
                <Button size="icon-lg" variant="outline">
                  <Icon name="heart-wishlist" size="lg" />
                </Button>
              </div>
            </div>
          </div>
        </section>

        <Separator />

        {/* Badges Section */}
        <section>
          <h2 className="mb-6 text-2xl font-semibold">Badges</h2>
          <div className="flex flex-wrap gap-3">
            <Badge variant="neutral">Neutral</Badge>
            <Badge variant="info">Info</Badge>
            <Badge variant="success">Success</Badge>
            <Badge variant="alert">Alert</Badge>
            <Badge variant="destructive">Destructive</Badge>
          </div>
        </section>

        <Separator />

        {/* Icons Section */}
        <section>
          <h2 className="mb-6 text-2xl font-semibold">Icons</h2>
          <div className="space-y-4">
            <div>
              <h3 className="text-muted-foreground mb-3 text-sm font-medium">
                Sizes
              </h3>
              <div className="flex flex-wrap items-center gap-4">
                <Icon name="heart-wishlist" size="sm" />
                <Icon name="heart-wishlist" size="md" />
                <Icon name="heart-wishlist" size="lg" />
              </div>
            </div>
            <div>
              <h3 className="text-muted-foreground mb-3 text-sm font-medium">
                Colors
              </h3>
              <div className="flex flex-wrap items-center gap-4">
                <Icon name="heart-wishlist" color="primary" size="md" />
                <Icon name="heart-wishlist" color="secondary" size="md" />
                <Icon name="heart-wishlist" color="tertiary" size="md" />
                <Icon name="heart-wishlist" color="current" size="md" />
              </div>
            </div>
          </div>
        </section>

        <Separator />

        {/* Form Inputs Section */}
        <section>
          <h2 className="mb-6 text-2xl font-semibold">Form Inputs</h2>
          <div className="max-w-md space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="name@example.com"
                size="default"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password (Small)</Label>
              <Input
                id="password"
                type="password"
                placeholder="Enter password"
                size="sm"
              />
            </div>
            <div className="flex items-center space-x-2">
              <Switch
                checked={switchChecked}
                onCheckedChange={setSwitchChecked}
                id="notifications"
              />
              <Label htmlFor="notifications">Enable notifications</Label>
            </div>
            <div className="flex items-center space-x-2">
              <Checkbox
                checked={checkboxChecked}
                onCheckedChange={(checked) =>
                  setCheckboxChecked(checked === true)
                }
                id="terms"
              />
              <Label htmlFor="terms">Accept terms and conditions</Label>
            </div>
          </div>
        </section>

        <Separator />

        {/* Progress & Loading Section */}
        <section>
          <h2 className="mb-6 text-2xl font-semibold">Progress & Loading</h2>
          <div className="max-w-md space-y-6">
            <div className="space-y-2">
              <Label>Progress Bar (60%)</Label>
              <Progress value={60} />
            </div>
            <div className="space-y-2">
              <Label>Loading Spinner</Label>
              <Spinner />
            </div>
          </div>
        </section>

        <Separator />

        {/* Avatar Section */}
        <section>
          <h2 className="mb-6 text-2xl font-semibold">Avatars</h2>
          <div className="flex flex-wrap items-center gap-4">
            <Avatar
              alt="Felix Avatar"
              src="https://api.dicebear.com/7.x/avataaars/svg?seed=Felix"
            />
            <Avatar
              alt="Aneka Avatar"
              src="https://api.dicebear.com/7.x/avataaars/svg?seed=Aneka"
            />
            <Avatar alt="KB Avatar" fullName="KB" />
          </div>
        </section>

        <Separator />

        {/* Additional Form Components */}
        <section>
          <h2 className="mb-6 text-2xl font-semibold">More Form Components</h2>
          <div className="max-w-md space-y-6">
            {/* Textarea */}
            <div className="space-y-2">
              <Label htmlFor="message">Message (Textarea)</Label>
              <Textarea
                id="message"
                placeholder="Type your message here..."
                rows={4}
              />
            </div>

            {/* Select */}
            <div className="space-y-2">
              <Label htmlFor="country">Country (Select)</Label>
              <Select value={selectValue} onValueChange={setSelectValue}>
                <SelectTrigger id="country">
                  <SelectValue placeholder="Select a country" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="us">United States</SelectItem>
                  <SelectItem value="uk">United Kingdom</SelectItem>
                  <SelectItem value="ca">Canada</SelectItem>
                  <SelectItem value="au">Australia</SelectItem>
                  <SelectItem value="de">Germany</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* RadioGroup */}
            <div className="space-y-2">
              <Label>Notification Method (RadioGroup)</Label>
              <RadioGroup value={radioValue} onValueChange={setRadioValue}>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="option-one" id="option-one" />
                  <Label htmlFor="option-one">Email</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="option-two" id="option-two" />
                  <Label htmlFor="option-two">SMS</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="option-three" id="option-three" />
                  <Label htmlFor="option-three">Push Notification</Label>
                </div>
              </RadioGroup>
            </div>
          </div>
        </section>

        <Separator />

        {/* Toggle & ToggleGroup */}
        <section>
          <h2 className="mb-6 text-2xl font-semibold">Toggle Components</h2>
          <div className="space-y-6">
            <div>
              <h3 className="text-muted-foreground mb-3 text-sm font-medium">
                Single Toggle (different from Switch)
              </h3>
              <Toggle
                pressed={togglePressed}
                onPressedChange={setTogglePressed}
                aria-label="Toggle italic"
              >
                <Icon name="heart-wishlist" size="sm" />
              </Toggle>
            </div>

            <div>
              <h3 className="text-muted-foreground mb-3 text-sm font-medium">
                Toggle Group (Text Alignment)
              </h3>
              <ToggleGroup
                type="single"
                value={toggleGroupValue}
                onValueChange={(value) => value && setToggleGroupValue(value)}
              >
                <ToggleGroupItem value="left" aria-label="Align left">
                  Left
                </ToggleGroupItem>
                <ToggleGroupItem value="center" aria-label="Align center">
                  Center
                </ToggleGroupItem>
                <ToggleGroupItem value="right" aria-label="Align right">
                  Right
                </ToggleGroupItem>
              </ToggleGroup>
            </div>
          </div>
        </section>

        <Separator />

        {/* Overlays */}
        <section>
          <h2 className="mb-6 text-2xl font-semibold">Overlays</h2>
          <div className="space-y-6">
            {/* Modal */}
            <div>
              <h3 className="text-muted-foreground mb-3 text-sm font-medium">
                Modal Dialog
              </h3>
              <ModalRoot open={modalOpen} onOpenChange={setModalOpen}>
                <ModalTrigger asChild>
                  <Button variant="outline">Open Modal</Button>
                </ModalTrigger>
                <ModalContent>
                  <ModalHeader>
                    <ModalTitle>Modal Title</ModalTitle>
                    <ModalDescription>
                      This is a modal dialog built with the Wander design
                      system. It can contain any content you need.
                    </ModalDescription>
                  </ModalHeader>
                  <div className="py-4">
                    <Text variant="body">
                      Modal content goes here. You can add forms, images, or any
                      other content you need.
                    </Text>
                  </div>
                  <ModalFooter>
                    <Button
                      variant="secondary"
                      onClick={() => setModalOpen(false)}
                    >
                      Cancel
                    </Button>
                    <Button
                      variant="primary"
                      onClick={() => setModalOpen(false)}
                    >
                      Confirm
                    </Button>
                  </ModalFooter>
                </ModalContent>
              </ModalRoot>
            </div>

            {/* Tooltip */}
            <div>
              <h3 className="text-muted-foreground mb-3 text-sm font-medium">
                Tooltip
              </h3>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="outline">Hover me</Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <Text variant="body-sm">This is a helpful tooltip</Text>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
          </div>
        </section>

        {/* Footer */}
        <div className="bg-muted rounded-lg p-6 text-center">
          <p className="text-muted-foreground text-sm">
            Visit{" "}
            <a
              href="https://wander-ds.vercel.app"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-foreground font-medium underline underline-offset-4"
            >
              wander-ds.vercel.app
            </a>{" "}
            for full documentation
          </p>
        </div>
      </div>
    </div>
  );
}
