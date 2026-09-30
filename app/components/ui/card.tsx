import type { ElementType, HTMLAttributes } from "react";
import { cx } from "./cx";

export type CardProps = HTMLAttributes<HTMLElement> & {
  /** Rendered element; use "article", "section" or "aside" for real semantics. */
  as?: ElementType;
  padded?: boolean;
  flat?: boolean;
  /** Lift on hover. Only for cards that are themselves a target. */
  interactive?: boolean;
};

export function Card({ as: Tag = "div", padded, flat, interactive, className, ...rest }: CardProps) {
  return (
    <Tag
      {...rest}
      className={cx(
        "ui-card",
        padded && "ui-card--padded",
        flat && "ui-card--flat",
        interactive && "ui-card--interactive",
        className,
      )}
    />
  );
}
