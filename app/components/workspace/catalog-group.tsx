import type { ReactNode } from "react";
import { cx } from "@/app/components/ui";

/** A mechanism section of the catalog: header with explanation popover, then its phrase rows. */
export function CatalogGroup({
  title,
  hint,
  count,
  help,
  helpOpen,
  children,
}: {
  title: string;
  hint: string;
  count: number;
  help: ReactNode;
  /** Raises the group above its siblings while its popover is open. */
  helpOpen: boolean;
  children: ReactNode;
}) {
  return (
    <section aria-label={title} className={cx("catalog-group", helpOpen && "has-open-help")}>
      <header className="catalog-group__header">
        <span className="catalog-group__title">{title}</span>
        <span className="catalog-group__help">{help}</span>
        <span className="catalog-group__hint">{hint}</span>
        <span className="catalog-group__count">{String(count).padStart(2, "0")}</span>
      </header>
      {children}
    </section>
  );
}
