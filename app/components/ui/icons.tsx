import type { ReactNode, SVGProps } from "react";

type IconProps = Omit<SVGProps<SVGSVGElement>, "children"> & { size?: number };

/** Shared 24px stroke icon frame. Decorative by default: pair with text or an aria-label on the control. */
function Icon({ size = 18, strokeWidth = 2.2, children, ...rest }: IconProps & { children: ReactNode }) {
  return (
    <svg
      aria-hidden="true"
      fill="none"
      height={size}
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={strokeWidth}
      viewBox="0 0 24 24"
      width={size}
      {...rest}
    >
      {children}
    </svg>
  );
}

export function SearchIcon(props: IconProps) {
  return <Icon {...props}><circle cx="11" cy="11" r="7" /><path d="m21 21-4.35-4.35" /></Icon>;
}

export function PlusIcon(props: IconProps) {
  return <Icon strokeWidth={2.5} {...props}><path d="M12 5v14M5 12h14" /></Icon>;
}

export function CheckIcon(props: IconProps) {
  return <Icon strokeWidth={2.5} {...props}><path d="m20 6-11 11-5-5" /></Icon>;
}

export function CloseIcon(props: IconProps) {
  return <Icon {...props}><path d="M6 6l12 12M18 6 6 18" /></Icon>;
}

export function FilterIcon(props: IconProps) {
  return <Icon {...props}><path d="M4 6h16M7 12h10M10 18h4" /></Icon>;
}

export function MoreIcon(props: IconProps) {
  return (
    <Icon strokeWidth={0} {...props}>
      <circle cx="5" cy="12" fill="currentColor" r="1.9" />
      <circle cx="12" cy="12" fill="currentColor" r="1.9" />
      <circle cx="19" cy="12" fill="currentColor" r="1.9" />
    </Icon>
  );
}

export function PlayIcon(props: IconProps) {
  return <Icon strokeWidth={0} {...props}><path d="M8 5.6v12.8a1 1 0 0 0 1.5.86l10.4-6.4a1 1 0 0 0 0-1.72L9.5 4.74A1 1 0 0 0 8 5.6z" fill="currentColor" /></Icon>;
}

export function ArrowUpRightIcon(props: IconProps) {
  return <Icon {...props}><path d="M7 17 17 7M8 7h9v9" /></Icon>;
}

export function ChevronRightIcon(props: IconProps) {
  return <Icon {...props}><path d="m9 6 6 6-6 6" /></Icon>;
}

export function GlobeIcon(props: IconProps) {
  return <Icon strokeWidth={1.8} {...props}><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" /></Icon>;
}
