import { cx } from "./cx";

/** Decorative activity indicator; pair it with text or aria-busy on the owning control. */
export function Spinner({ className }: { className?: string }) {
  return <span aria-hidden="true" className={cx("ui-spinner", className)} />;
}

/** Placeholder block shown while content loads. */
export function Skeleton({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return <span aria-hidden="true" className={cx("ui-skeleton", className)} style={style} />;
}
