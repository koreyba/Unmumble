import Link from "next/link";
import type { AnchorHTMLAttributes, ButtonHTMLAttributes, ReactNode } from "react";
import { cx } from "./cx";
import { Spinner } from "./spinner";

export type ButtonVariant = "primary" | "secondary" | "soft" | "ghost" | "danger" | "brand";
export type ButtonSize = "sm" | "md" | "lg";

type ButtonStyle = {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Fully rounded ends; used by marketing calls to action. */
  pill?: boolean;
  /** Stretch to the width of the container. */
  block?: boolean;
  /** Secondary button that only turns red on hover/focus (Remove, Sign out). */
  quietDanger?: boolean;
  /** Below the tablet breakpoint the label collapses and the button becomes a square icon button. */
  collapse?: boolean;
};

/** Class names for anything that should look like a Unmumble button (buttons, links, labels). */
export function buttonClassName({
  variant = "secondary",
  size = "md",
  pill,
  block,
  quietDanger,
  collapse,
  icon,
  className,
}: ButtonStyle & { icon?: boolean; className?: string } = {}) {
  return cx(
    "ui-button",
    variant !== "secondary" && `ui-button--${variant}`,
    size !== "md" && `ui-button--${size}`,
    pill && "ui-button--pill",
    block && "ui-button--block",
    quietDanger && "ui-button--quiet-danger",
    collapse && "ui-button--collapse",
    icon && "ui-button--icon",
    className,
  );
}

export type ButtonProps = ButtonStyle & ButtonHTMLAttributes<HTMLButtonElement> & {
  /** Shows a spinner, marks the button busy and blocks repeat activation. */
  loading?: boolean;
  /** Content rendered before the label, typically an icon. */
  icon?: ReactNode;
};

export function Button({
  variant,
  size,
  pill,
  block,
  quietDanger,
  collapse,
  loading = false,
  icon,
  className,
  children,
  disabled,
  type = "button",
  ...rest
}: ButtonProps) {
  return (
    <button
      {...rest}
      aria-busy={loading || undefined}
      className={buttonClassName({ variant, size, pill, block, quietDanger, collapse, className })}
      disabled={disabled || loading}
      type={type}
    >
      {loading ? <Spinner /> : icon}
      {collapse ? <span className="ui-button__label">{children}</span> : children}
    </button>
  );
}

export type IconButtonProps = Omit<ButtonProps, "icon" | "children" | "block" | "collapse" | "aria-label"> & {
  /** Accessible name. Icon-only controls must always have one. */
  label: string;
  children: ReactNode;
};

/** Square, icon-only button. `label` becomes both the accessible name and the tooltip. */
export function IconButton({
  label,
  variant,
  size,
  pill,
  quietDanger,
  loading = false,
  className,
  children,
  disabled,
  title,
  type = "button",
  ...rest
}: IconButtonProps) {
  return (
    <button
      {...rest}
      aria-busy={loading || undefined}
      aria-label={label}
      className={buttonClassName({ variant, size, pill, quietDanger, icon: true, className })}
      disabled={disabled || loading}
      title={title ?? label}
      type={type}
    >
      {loading ? <Spinner /> : children}
    </button>
  );
}

export type ButtonLinkProps = ButtonStyle & Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href"> & {
  href: string;
  /** Force a full page load. Needed for routes that live outside the Next router (sign-in, /trainer). */
  native?: boolean;
  icon?: ReactNode;
};

export function ButtonLink({
  variant,
  size,
  pill,
  block,
  quietDanger,
  native = false,
  icon,
  className,
  children,
  href,
  ...rest
}: ButtonLinkProps) {
  const classes = buttonClassName({ variant, size, pill, block, quietDanger, className });
  const content = (
    <>
      {icon}
      {children}
    </>
  );

  if (native || !href.startsWith("/")) {
    return <a {...rest} className={classes} href={href}>{content}</a>;
  }
  return <Link {...rest} className={classes} href={href}>{content}</Link>;
}
