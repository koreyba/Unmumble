import type { HTMLAttributes } from "react";
import { cx } from "./cx";

export type BadgeTone = "neutral" | "info" | "success" | "warning" | "danger" | "clay";

export function Badge({
  tone = "neutral",
  className,
  ...rest
}: HTMLAttributes<HTMLSpanElement> & { tone?: BadgeTone }) {
  return <span {...rest} className={cx("ui-badge", tone !== "neutral" && `ui-badge--${tone}`, className)} />;
}
