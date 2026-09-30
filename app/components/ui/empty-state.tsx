import type { HTMLAttributes, ReactNode } from "react";
import { cx } from "./cx";
import { Skeleton } from "./spinner";

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
  ...rest
}: Omit<HTMLAttributes<HTMLDivElement>, "title"> & {
  icon?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div {...rest} className={cx("ui-empty", className)}>
      {icon && <span aria-hidden="true" className="ui-empty__icon">{icon}</span>}
      <p className="ui-empty__title">{title}</p>
      {description && <p className="ui-empty__text">{description}</p>}
      {action && <div className="ui-empty__action">{action}</div>}
    </div>
  );
}

/** Loading stand-in for a list: a stack of shimmering rows. */
export function ListSkeleton({ rows = 4, label = "Loading" }: Readonly<{ rows?: number; label?: string }>) {
  return (
    <div aria-busy="true" aria-label={label} className="ui-list-skeleton" role="status">
      {Array.from({ length: rows }, (_, index) => (
        <Skeleton className="ui-list-skeleton__row" key={index} style={{ opacity: 1 - index * 0.16 }} />
      ))}
    </div>
  );
}
