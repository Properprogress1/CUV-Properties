"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { SlidersHorizontal, X } from "lucide-react";
import type { ReactNode } from "react";

export function FilterDrawer({ children }: { children: ReactNode }) {
  return (
    <div className="cuv-filter-drawer">
      <Dialog.Root>
        <Dialog.Trigger asChild>
          <button className="button button-light" aria-label="Open filters">
            <SlidersHorizontal size={18} aria-hidden="true" /> Filters
          </button>
        </Dialog.Trigger>
        <Dialog.Portal>
          <Dialog.Overlay className="cuv-overlay" />
          <Dialog.Content
            className="cuv-filter-sheet"
            aria-describedby={undefined}
          >
            <div className="cuv-filter-sheet-head">
              <Dialog.Title>Refine results</Dialog.Title>
              <Dialog.Close asChild>
                <button className="cuv-menu-close" aria-label="Close filters">
                  <X size={20} aria-hidden="true" />
                </button>
              </Dialog.Close>
            </div>
            {children}
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}
