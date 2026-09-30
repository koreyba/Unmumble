import type { HTMLAttributes, ReactNode } from "react";
import { cx } from "./cx";

export type NoticeTone = "info" | "success" | "warning" | "danger";

/**
 * Inline status message. Danger notices announce assertively (role="alert"),
 * everything else politely (role="status").
 */
export function Notice({
  tone = "info",
  action,
  className,
  children,
  ...rest
}: Omit<HTMLAttributes<HTMLDivElement>, "children"> & {
  tone?: NoticeTone;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div
      role={tone === "danger" ? "alert" : "status"}
      {...rest}
      className={cx("ui-notice", tone !== "info" && `ui-notice--${tone}`, className)}
    >
      <div className="ui-notice__body">{children}</div>
      {action && <div className="ui-notice__action">{action}</div>}
    </div>
  );
}
