"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { cx } from "./cx";

/**
 * "?" button that reveals a short explanation. Controlled so that a parent can
 * keep at most one popover open. Closes on outside press and on Escape.
 */
export function InfoPopover({
  open,
  onOpenChange,
  label,
  title,
  example,
  align = "start",
  children,
}: Readonly<{
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** What the trigger explains; forms the accessible name "Explain {label}". */
  label: string;
  title: ReactNode;
  example?: ReactNode;
  align?: "start" | "end";
  children: ReactNode;
}>) {
  const rootRef = useRef<HTMLDivElement>(null);
  const onOpenChangeRef = useRef(onOpenChange);

  useEffect(() => {
    onOpenChangeRef.current = onOpenChange;
  }, [onOpenChange]);

  useEffect(() => {
    if (!open) return;
    const handlePointerDown = (event: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) onOpenChangeRef.current(false);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      onOpenChangeRef.current(false);
      rootRef.current?.querySelector<HTMLElement>(".ui-help__trigger")?.focus();
    };
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  return (
    <div className="ui-help" ref={rootRef}>
      <button
        aria-expanded={open}
        aria-label={`Explain ${label}`}
        className="ui-help__trigger"
        onClick={(event) => {
          event.stopPropagation();
          onOpenChange(!open);
        }}
        type="button"
      >
        ?
      </button>
      {open && (
        <div
          aria-label={typeof title === "string" ? title : label}
          className={cx("ui-help__panel", align === "end" && "ui-help__panel--end")}
          role="dialog"
        >
          <div className="ui-help__header">
            <strong className="ui-help__title">{title}</strong>
            <button
              aria-label="Close explanation"
              className="ui-button ui-button--ghost ui-button--icon ui-button--sm"
              onClick={() => {
                onOpenChange(false);
                rootRef.current?.querySelector<HTMLElement>(".ui-help__trigger")?.focus();
              }}
              type="button"
            >
              ✕
            </button>
          </div>
          <p className="ui-help__text">{children}</p>
          {example && <span className="ui-help__example">{example}</span>}
        </div>
      )}
    </div>
  );
}
