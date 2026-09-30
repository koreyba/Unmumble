import type {
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from "react";
import { cx } from "./cx";

/** Label, control slot, hint and error laid out consistently. The control's `id` must equal `htmlFor`. */
export function Field({
  label,
  htmlFor,
  hint,
  error,
  className,
  children,
}: Readonly<{
  label: ReactNode;
  htmlFor: string;
  hint?: ReactNode;
  error?: ReactNode;
  className?: string;
  children: ReactNode;
}>) {
  return (
    <div className={cx("ui-field", className)}>
      <label className="ui-field__label" htmlFor={htmlFor}>{label}</label>
      {children}
      {hint && !error && <p className="ui-field__hint">{hint}</p>}
      {error && <p className="ui-field__error" role="alert">{error}</p>}
    </div>
  );
}

export function TextInput({
  invalid,
  className,
  type = "text",
  ...rest
}: InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }) {
  return <input {...rest} aria-invalid={invalid || undefined} className={cx("ui-input", className)} type={type} />;
}

export function TextArea({
  invalid,
  className,
  ...rest
}: TextareaHTMLAttributes<HTMLTextAreaElement> & { invalid?: boolean }) {
  return <textarea {...rest} aria-invalid={invalid || undefined} className={cx("ui-textarea", className)} />;
}

export function SelectInput({ className, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...rest} className={cx("ui-select", className)} />;
}

/** Text input with a leading icon and a single focus ring around the whole row. */
export function SearchField({
  icon,
  className,
  wrapperClassName,
  type = "search",
  ...rest
}: InputHTMLAttributes<HTMLInputElement> & { icon?: ReactNode; wrapperClassName?: string }) {
  return (
    <div className={cx("ui-search", wrapperClassName)}>
      {icon}
      <input {...rest} className={className} type={type} />
    </div>
  );
}
