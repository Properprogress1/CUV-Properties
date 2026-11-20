"use client";

import * as Dialog from "@radix-ui/react-dialog";
import Link from "next/link";
import { ArrowUpRight, Menu, UserRound, X } from "lucide-react";
import { usePathname } from "next/navigation";
import { useState } from "react";

const links = [
  ["Properties", "/browse/properties"],
  ["Land", "/browse/land"],
  ["Vehicles", "/browse/vehicles"],
  ["Services", "/browse/services"],
] as const;

export function Brand() {
  return (
    <Link className="cuv-brand" href="/" aria-label="CUV Marketplace home">
      <span className="cuv-monogram">CUV</span>
      <span>Marketplace</span>
    </Link>
  );
}

export function Navigation() {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  return (
    <header className="cuv-header">
      <div className="wrap cuv-nav">
        <Brand />
        <nav className="cuv-desktop" aria-label="Main navigation">
          {links.map(([name, href]) => (
            <Link
              key={href}
              href={href}
              aria-current={path === href ? "page" : undefined}
            >
              {name}
            </Link>
          ))}
        </nav>
        <div className="cuv-actions">
          <Link href="/account" className="cuv-account" aria-label="Account">
            <UserRound size={18} aria-hidden="true" />
            <span>Account</span>
          </Link>
          <Link href="/browse" className="button button-dark cuv-browse">
            Browse listings <ArrowUpRight size={16} aria-hidden="true" />
          </Link>
          <Dialog.Root open={open} onOpenChange={setOpen}>
            <Dialog.Trigger asChild>
              <button className="cuv-menu" aria-label="Open menu">
                <Menu size={22} aria-hidden="true" />
              </button>
            </Dialog.Trigger>
            <Dialog.Portal>
              <Dialog.Overlay className="cuv-overlay" />
              <Dialog.Content
                className="cuv-mobile-nav"
                aria-describedby={undefined}
              >
                <div>
                  <Dialog.Title>Explore CUV</Dialog.Title>
                  <Dialog.Close asChild>
                    <button className="cuv-menu-close" aria-label="Close menu">
                      <X size={22} aria-hidden="true" />
                    </button>
                  </Dialog.Close>
                </div>
                <nav aria-label="Mobile navigation">
                  {[
                    ...links,
                    ["All listings", "/browse"],
                    ["Account", "/account"],
                    ["Marketplace information", "/pages"],
                  ].map(([name, href]) => (
                    <Link
                      key={href}
                      href={href!}
                      onClick={() => setOpen(false)}
                    >
                      {name}
                      <ArrowUpRight size={18} aria-hidden="true" />
                    </Link>
                  ))}
                </nav>
              </Dialog.Content>
            </Dialog.Portal>
          </Dialog.Root>
        </div>
      </div>
    </header>
  );
}
