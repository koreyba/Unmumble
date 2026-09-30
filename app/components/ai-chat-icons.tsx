import type { ReactNode } from "react";

/**
 * Stroke icons used by the AI Chat surface. They match the navigation icon set
 * (24px grid, 1.8 stroke, round caps) and inherit `currentColor`, so they follow
 * every button variant in both themes. Purely decorative: the owning control
 * carries the accessible name.
 */
function ChatIcon({ children, size = 20 }: Readonly<{ children: ReactNode; size?: number }>) {
  return (
    <svg
      aria-hidden="true"
      fill="none"
      focusable="false"
      height={size}
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.9"
      viewBox="0 0 24 24"
      width={size}
    >
      {children}
    </svg>
  );
}

export function SendIcon() {
  return <ChatIcon><path d="M12 19V5M5.5 11.5 12 5l6.5 6.5" /></ChatIcon>;
}

export function StopIcon() {
  return (
    <ChatIcon>
      <rect fill="currentColor" height="11" rx="2.5" stroke="none" width="11" x="6.5" y="6.5" />
    </ChatIcon>
  );
}

export function ExpandIcon() {
  return <ChatIcon size={18}><path d="M14 4h6v6M10 20H4v-6M20 4l-7 7M4 20l7-7" /></ChatIcon>;
}

export function CloseIcon() {
  return <ChatIcon size={20}><path d="M6 6l12 12M18 6 6 18" /></ChatIcon>;
}

export function MenuIcon() {
  return <ChatIcon size={18}><path d="M4 7h16M4 12h16M4 17h10" /></ChatIcon>;
}

export function PlusIcon() {
  return <ChatIcon size={18}><path d="M12 5v14M5 12h14" /></ChatIcon>;
}

export function ArrowDownIcon() {
  return <ChatIcon size={16}><path d="M12 5v14M5.5 12.5 12 19l6.5-6.5" /></ChatIcon>;
}

export function RetryIcon() {
  return <ChatIcon size={16}><path d="M4 12a8 8 0 1 1 2.6 5.9M4 18v-5h5" /></ChatIcon>;
}

export function TranslateIcon() {
  return <ChatIcon size={18}><path d="M4 6h9M8.5 4v2M6 6c.5 3 2.5 5.5 5.5 7M11.5 6c-.5 3-2.5 5.5-6 7.5M13 20l4-9 4 9M14.4 17h5.2" /></ChatIcon>;
}

export function BookmarkPlusIcon() {
  return <ChatIcon size={18}><path d="M7 4h10a1 1 0 0 1 1 1v15l-6-3.6L6 20V5a1 1 0 0 1 1-1zM12 8v5M9.5 10.5h5" /></ChatIcon>;
}

export function SparkleIcon({ size = 24 }: Readonly<{ size?: number }>) {
  return (
    <ChatIcon size={size}>
      <path d="M12 3.5c.6 4.6 3.4 7.4 8 8-4.6.6-7.4 3.4-8 8-.6-4.6-3.4-7.4-8-8 4.6-.6 7.4-3.4 8-8z" />
    </ChatIcon>
  );
}

export function MessageIcon({ size = 24 }: Readonly<{ size?: number }>) {
  return <ChatIcon size={size}><path d="M20 11.5a7.5 7.5 0 0 1-10.9 6.7L4 20l1.4-4.3A7.5 7.5 0 1 1 20 11.5z" /></ChatIcon>;
}

export function MoreIcon() {
  return (
    <ChatIcon size={20}>
      <circle cx="5.5" cy="12" fill="currentColor" r="1.4" stroke="none" />
      <circle cx="12" cy="12" fill="currentColor" r="1.4" stroke="none" />
      <circle cx="18.5" cy="12" fill="currentColor" r="1.4" stroke="none" />
    </ChatIcon>
  );
}

export function PencilIcon() {
  return <ChatIcon size={18}><path d="M4 20h4L19 9a2.1 2.1 0 0 0-3-3L5 17zM14 8l3 3" /></ChatIcon>;
}

export function TrashIcon() {
  return <ChatIcon size={18}><path d="M4.5 7h15M10 7V4.5h4V7M6.5 7l.8 12.5h9.4L17.5 7M10 11v5M14 11v5" /></ChatIcon>;
}
