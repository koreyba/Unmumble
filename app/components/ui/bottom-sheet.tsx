"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";

const FOCUSABLE = 'a[href], button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])';

/**
 * Modal panel anchored to the bottom edge. Owns the modal behaviour so callers
 * do not have to: Escape and backdrop close it, background scroll is locked,
 * focus moves inside and returns to the opener, and Tab stays within the sheet.
 */
export function BottomSheet({
  open,
  onClose,
  title,
  subtitle,
  label,
  children,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  /** Visible heading. Omit and pass `label` when the content brings its own heading. */
  title?: ReactNode;
  subtitle?: ReactNode;
  label?: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const sheetRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  const titleId = useId();

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!open) return;
    const sheet = sheetRef.current;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    sheet?.focus({ preventScroll: true });

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        onCloseRef.current();
        return;
      }
      if (event.key !== "Tab" || !sheet) return;
      const focusable = Array.from(sheet.querySelectorAll<HTMLElement>(FOCUSABLE));
      if (focusable.length === 0) {
        event.preventDefault();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && (document.activeElement === first || document.activeElement === sheet)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
      if (opener?.isConnected) opener.focus({ preventScroll: true });
    };
  }, [open]);

  if (!open) return null;

  // Portalled to <body> so no ancestor (transform, filter, overflow) can clip or re-anchor it.
  return createPortal(
    <>
      <button aria-label="Close" className="ui-sheet-backdrop" onClick={onClose} tabIndex={-1} type="button" />
      <div
        aria-labelledby={title ? titleId : undefined}
        aria-label={title ? undefined : label}
        aria-modal="true"
        className="ui-sheet"
        ref={sheetRef}
        role="dialog"
        tabIndex={-1}
      >
        <div aria-hidden="true" className="ui-sheet__handle" />
        <div className="ui-sheet__body">
          {title && (
            <header>
              <h2 className="ui-sheet__title" id={titleId}>{title}</h2>
              {subtitle && <p className="ui-sheet__subtitle">{subtitle}</p>}
            </header>
          )}
          {children}
        </div>
        {footer && <div className="ui-sheet__footer">{footer}</div>}
      </div>
    </>,
    document.body,
  );
}
