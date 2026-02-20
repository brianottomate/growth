"use client";

import { useState } from "react";
import Link from "next/link";
import { Dialog, DialogPanel, PopoverGroup } from "@headlessui/react";
import { PhoneIcon } from "@heroicons/react/20/solid";
import {
  Bars3Icon,
  ChartPieIcon,
  CursorArrowRaysIcon,
  FingerPrintIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";
import { BarChart3 } from "lucide-react";

import { Button } from "@wandercom/design-system-web/ui/button";
import { Heading } from "@wandercom/design-system-web/ui/heading";
import { Text } from "@wandercom/design-system-web/ui/text";
import { Separator } from "@wandercom/design-system-web/ui/separator";
import { ThemeToggleDropdown } from "@/components/ui/theme";

import { authClient } from "@/server/better-auth/client";

// Icon mapping for dynamic icon rendering
const iconMap = {
  ChartPieIcon,
  CursorArrowRaysIcon,
  FingerPrintIcon,
  PhoneIcon,
};

interface NavigationItem {
  name: string;
  href: string;
  description?: string;
  icon?: keyof typeof iconMap;
}

interface NavigationStructure {
  product: NavigationItem[];
  callsToAction: NavigationItem[];
  simple: NavigationItem[];
}

interface HeaderClientProps {
  navigation: NavigationStructure;
}

export default function HeaderClient({ navigation }: HeaderClientProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { data: session, isPending } = authClient.useSession();

  // Use real session state, but default to logged out during loading for marketing focus
  const isLoggedIn = isPending ? false : !!session?.user;

  const getIcon = (iconName: keyof typeof iconMap) => {
    return iconMap[iconName];
  };

  return (
    <>
      {/* Mobile Header - Auth Buttons + Theme + Menu */}
      <div className="flex items-center gap-x-2 lg:hidden">
        {isLoggedIn ? (
          <Button variant="primary" size="xs" asChild>
            <Link href="/app/dashboard">Dashboard</Link>
          </Button>
        ) : (
          <>
            <Button variant="ghost" size="xs" asChild>
              <Link href="/signin">Sign in</Link>
            </Button>
            <Button variant="primary" size="xs" asChild>
              <Link href="/signup">Get started</Link>
            </Button>
          </>
        )}
        <ThemeToggleDropdown />
        <button
          type="button"
          onClick={() => setMobileMenuOpen(true)}
          className="text-secondary hover:text-primary -m-2.5 inline-flex items-center justify-center rounded-md p-2.5 transition-colors"
        >
          <span className="sr-only">Open main menu</span>
          <Bars3Icon aria-hidden="true" className="size-6" />
        </button>
      </div>

      {/* Desktop Navigation */}
      <PopoverGroup className="hidden lg:flex lg:gap-x-12">
        {/* Temporarily hidden Product dropdown */}
        {/* <Popover className="relative">
          {({ close }) => (
            <>
              <PopoverButton className="text-foreground hover:text-primary hover:bg-muted/50 flex cursor-pointer items-center gap-x-1 rounded-full px-3 py-1.5 text-sm/6 font-semibold transition-all">
                Product
                <ChevronDownIcon
                  aria-hidden="true"
                  className="text-muted-foreground size-5 flex-none"
                />
              </PopoverButton>

              <PopoverPanel
                transition
                className="absolute left-1/2 z-10 mt-3 w-screen max-w-md -translate-x-1/2 overflow-hidden rounded-3xl bg-white shadow-lg ring-1 ring-gray-900/5 transition data-closed:translate-y-1 data-closed:opacity-0 data-enter:duration-200 data-enter:ease-out data-leave:duration-150 data-leave:ease-in"
              >
                <div className="p-4">
                  {navigation.product.map((item) => {
                    const IconComponent = item.icon ? getIcon(item.icon) : null;
                    return (
                      <div
                        key={item.name}
                        className="group relative flex items-center gap-x-6 rounded-lg p-4 text-sm/6 hover:bg-gray-50"
                      >
                        {IconComponent && (
                          <div className="flex size-11 flex-none items-center justify-center rounded-lg bg-gray-50 group-hover:bg-white">
                            <IconComponent
                              aria-hidden="true"
                              className="size-6 text-gray-600 group-hover:text-blue-600"
                            />
                          </div>
                        )}
                        <div className="flex-auto">
                          <Link
                            href={item.href}
                            className="block font-semibold text-gray-900"
                            onClick={close}
                          >
                            {item.name}
                            <span className="absolute inset-0" />
                          </Link>
                          {item.description && (
                            <p className="mt-1 text-gray-600">
                              {item.description}
                            </p>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div className="grid grid-cols-1 divide-y divide-gray-900/5 bg-gray-50">
                  {navigation.callsToAction.map((item) => {
                    const IconComponent = item.icon ? getIcon(item.icon) : null;

                    return (
                      <Link
                        key={item.name}
                        href={item.href}
                        className="flex items-center justify-center gap-x-2.5 p-3 text-sm/6 font-semibold text-gray-900 hover:bg-gray-100"
                        onClick={close}
                      >
                        {IconComponent && (
                          <IconComponent
                            aria-hidden="true"
                            className="size-5 flex-none text-gray-400"
                          />
                        )}
                        {item.name}
                      </Link>
                    );
                  })}
                </div>
              </PopoverPanel>
            </>
          )}
        </Popover> */}

        {navigation.simple.map((item) => (
          <Text
            key={item.name}
            as="span"
            variant="body"
            weight="medium"
            className="transition-colors"
          >
            <Link
              href={item.href}
              className="text-primary hover:bg-surface-secondary rounded-full px-3 py-1.5 transition-all"
            >
              {item.name}
            </Link>
          </Text>
        ))}
      </PopoverGroup>

      {/* Desktop Auth Buttons & Theme Toggle */}
      <div className="hidden lg:flex lg:flex-1 lg:items-center lg:justify-end lg:gap-x-4">
        <ThemeToggleDropdown />
        {isLoggedIn ? (
          <Button variant="primary" size="sm" asChild>
            <Link href="/app/dashboard">Dashboard</Link>
          </Button>
        ) : (
          <>
            <Button variant="ghost" size="sm" asChild>
              <Link href="/signin">Sign in</Link>
            </Button>
            <Button variant="primary" size="sm" asChild>
              <Link href="/signup">Sign up</Link>
            </Button>
          </>
        )}
      </div>

      {/* Mobile Navigation Dialog */}
      <Dialog
        open={mobileMenuOpen}
        onClose={setMobileMenuOpen}
        className="lg:hidden"
      >
        <div className="bg-neutral-1000/20 fixed inset-0 z-50 backdrop-blur-sm" />
        <DialogPanel className="border-primary bg-surface-primary/95 fixed inset-y-0 right-0 z-50 flex w-full flex-col justify-between overflow-y-auto backdrop-blur-sm sm:max-w-sm sm:border-l">
          <div className="p-6">
            <div className="flex items-center justify-between">
              <Link
                href="/"
                className="flex items-center space-x-2"
                onClick={() => setMobileMenuOpen(false)}
              >
                <div className="bg-surface-secondary border-secondary flex size-6 items-center justify-center rounded-md border">
                  <BarChart3 className="text-primary size-4" />
                </div>
                <Heading variant="headline-sm" asChild className="text-xl">
                  <span>Wander</span>
                </Heading>
              </Link>
              <button
                type="button"
                onClick={() => setMobileMenuOpen(false)}
                className="text-secondary hover:text-primary -m-2.5 rounded-md p-2.5 transition-colors"
              >
                <span className="sr-only">Close menu</span>
                <XMarkIcon aria-hidden="true" className="size-6" />
              </button>
            </div>
            <div className="mt-6 flow-root">
              <div className="-my-6 space-y-2">
                {/* Temporarily hidden Product items */}
                {/* <div className="space-y-2 py-6">
                  {navigation.product.map((item) => {
                    const IconComponent = item.icon ? getIcon(item.icon) : null;
                    return (
                      <Link
                        key={item.name}
                        href={item.href}
                        className="group text-foreground hover:bg-muted/50 hover:text-primary -mx-3 flex items-center gap-x-6 rounded-lg p-3 text-base/7 font-semibold transition-all"
                        onClick={() => setMobileMenuOpen(false)}
                      >
                        {IconComponent && (
                          <div className="bg-muted group-hover:bg-background flex size-11 flex-none items-center justify-center rounded-lg">
                            <IconComponent
                              aria-hidden="true"
                              className="text-muted-foreground group-hover:text-primary size-6"
                            />
                          </div>
                        )}
                        {item.name}
                      </Link>
                    );
                  })}
                </div> */}

                {/* Simple navigation items */}
                <div className="space-y-1 py-6">
                  {navigation.simple.map((item) => (
                    <Link
                      key={item.name}
                      href={item.href}
                      className="hover:bg-surface-secondary text-primary -mx-3 block rounded-lg px-3 py-2.5 transition-colors"
                      onClick={() => setMobileMenuOpen(false)}
                    >
                      <Text variant="body" weight="medium">
                        {item.name}
                      </Text>
                    </Link>
                  ))}
                </div>

                <Separator />

                {/* Auth buttons & Theme Toggle */}
                <div className="space-y-3 py-6">
                  <div className="flex justify-center pb-3">
                    <ThemeToggleDropdown />
                  </div>
                  {isLoggedIn ? (
                    <Button
                      variant="primary"
                      size="md"
                      className="w-full"
                      asChild
                    >
                      <Link
                        href="/app/dashboard"
                        onClick={() => setMobileMenuOpen(false)}
                      >
                        Dashboard
                      </Link>
                    </Button>
                  ) : (
                    <>
                      <Button
                        variant="ghost"
                        size="md"
                        className="w-full"
                        asChild
                      >
                        <Link
                          href="/signin"
                          onClick={() => setMobileMenuOpen(false)}
                        >
                          Sign in
                        </Link>
                      </Button>
                      <Button
                        variant="primary"
                        size="md"
                        className="w-full"
                        asChild
                      >
                        <Link
                          href="/signup"
                          onClick={() => setMobileMenuOpen(false)}
                        >
                          Sign up
                        </Link>
                      </Button>
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>

          {navigation.callsToAction.length > 0 && (
            <div className="border-primary bg-surface-secondary sticky bottom-0 grid grid-cols-1 divide-y divide-neutral-200 border-t text-center">
              {navigation.callsToAction.map((item) => {
                const IconComponent = item.icon ? getIcon(item.icon) : null;

                return (
                  <Link
                    key={item.name}
                    href={item.href}
                    className="hover:bg-surface-tertiary flex items-center justify-center gap-x-2.5 p-3 transition-colors"
                    onClick={() => setMobileMenuOpen(false)}
                  >
                    {IconComponent && (
                      <IconComponent
                        aria-hidden="true"
                        className="text-tertiary size-5 flex-none"
                      />
                    )}
                    <Text variant="body" weight="medium">
                      {item.name}
                    </Text>
                  </Link>
                );
              })}
            </div>
          )}
        </DialogPanel>
      </Dialog>
    </>
  );
}
