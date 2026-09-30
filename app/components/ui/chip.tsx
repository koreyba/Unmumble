import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode } from "react";
import { cx } from "./cx";

type ChipContent = {
  /** Trailing count, rendered with tabular numerals. */
  count?: ReactNode;
};

/** Static pill, for read-only facts such as the active practice format. */
export function Chip({ count, className, children, ...rest }: ChipContent & HTMLAttributes<HTMLSpanElement>) {
  return (
    <span {...rest} className={cx("ui-chip", className)}>
      {children}
      {count !== undefined && <span className="ui-chip__count">{count}</span>}
    </span>
  );
}

/** Pill button. Pass `active` for toggle chips and status filters. */
export function ChipButton({
  active,
  count,
  className,
  children,
  type = "button",
  ...rest
}: ChipContent & ButtonHTMLAttributes<HTMLButtonElement> & { active?: boolean }) {
  return (
    <button
      {...rest}
      aria-pressed={rest.role === "tab" ? undefined : active}
      aria-selected={rest.role === "tab" ? active : undefined}
      className={cx("ui-chip", className)}
      type={type}
    >
      {children}
      {count !== undefined && <span className="ui-chip__count">{count}</span>}
    </button>
  );
}
