"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { DefaultAccountWidget } from "./default-account-widget";

export type SiteSection = "home" | "library" | "practice" | "chat" | "videos" | "settings";

function NavIcon({ children }: { children: ReactNode }) {
  return (
    <svg aria-hidden="true" className="site-primary-link-svg" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" viewBox="0 0 24 24">
      {children}
    </svg>
  );
}

const primaryLinks: Array<{ href: string; label: string; section: SiteSection; icon: ReactNode }> = [
  {
    href: "/library",
    label: "Library",
    section: "library",
    icon: <NavIcon><path d="M4 5.5A1.5 1.5 0 0 1 5.5 4H11v16H5.5A1.5 1.5 0 0 1 4 18.5z" /><path d="M20 5.5A1.5 1.5 0 0 0 18.5 4H13v16h5.5a1.5 1.5 0 0 0 1.5-1.5z" /></NavIcon>,
  },
  {
    href: "/practice",
    label: "Practice",
    section: "practice",
    icon: <NavIcon><path d="M4 14v-2a8 8 0 0 1 16 0v2" /><rect height="6" rx="1.5" width="4" x="3" y="14" /><rect height="6" rx="1.5" width="4" x="17" y="14" /></NavIcon>,
  },
  {
    href: "/chat",
    label: "AI Chat",
    section: "chat",
    icon: <NavIcon><path d="M20 11.5a7.5 7.5 0 0 1-10.9 6.7L4 20l1.4-4.3A7.5 7.5 0 1 1 20 11.5z" /></NavIcon>,
  },
  {
    href: "/videos",
    label: "Videos",
    section: "videos",
    icon: <NavIcon><rect height="14" rx="3" width="18" x="3" y="5" /><path d="m10 9.5 5 2.5-5 2.5z" /></NavIcon>,
  },
  {
    href: "/settings",
    label: "Settings",
    section: "settings",
    icon: <NavIcon><path d="M4 7h10M18 7h2M4 17h2M10 17h10" /><circle cx="16" cy="7" r="2" /><circle cx="8" cy="17" r="2" /></NavIcon>,
  },
];

export function SiteNavigation({
  active,
  account,
}: {
  active: SiteSection;
  account?: ReactNode;
}) {
  return (
    <header className="site-navigation">
      <div className="site-navigation-inner">
        <div className="site-brand-context">
          <Link aria-current={active === "home" ? "page" : undefined} aria-label="Unmumble" className="site-brand" href="/">
            <span aria-hidden="true" className="site-brand-logo" />
          </Link>
          <span className="site-beta-badge">Beta</span>
        </div>
        <nav aria-label="Primary navigation" className="site-primary-links">
          {primaryLinks.map((link) => (
            <Link
              aria-current={active === link.section ? "page" : undefined}
              className="site-primary-link"
              href={link.href}
              key={link.section}
            >
              <span aria-hidden="true" className="site-primary-link-icon">{link.icon}</span>
              <span className="site-primary-link-label">{link.label}</span>
            </Link>
          ))}
        </nav>
        <div className="site-account">
          <a
            aria-label="Open source on GitHub"
            className="site-github-link"
            href="https://github.com/koreyba/Unmumble"
            rel="noreferrer"
            target="_blank"
          >
            <svg aria-hidden="true" className="site-github-icon" viewBox="0 0 24 24">
              <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.084-.729.084-.729 1.205.084 1.84 1.237 1.84 1.237 1.07 1.835 2.809 1.305 3.495.998.108-.776.418-1.305.762-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12" />
            </svg>
          </a>
          <button
            aria-label="Change color theme"
            aria-pressed="false"
            className="theme-toggle ui-button ui-button--ghost ui-button--icon"
            data-theme-toggle
            suppressHydrationWarning
            type="button"
          >
            <svg aria-hidden="true" className="theme-toggle-sun" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="1.9" viewBox="0 0 24 24">
              <circle cx="12" cy="12" r="4" />
              <path d="M12 2.5v2.2M12 19.3v2.2M4.9 4.9l1.6 1.6M17.5 17.5l1.6 1.6M2.5 12h2.2M19.3 12h2.2M4.9 19.1l1.6-1.6M17.5 6.5l1.6-1.6" />
            </svg>
            <svg aria-hidden="true" className="theme-toggle-moon" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.9" viewBox="0 0 24 24">
              <path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z" />
            </svg>
          </button>
          {account !== undefined ? account : <DefaultAccountWidget active={active} />}
        </div>
      </div>
    </header>
  );
}
