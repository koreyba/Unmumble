"use client";

import { useEffect, useState } from "react";
import { accountSession, signInHref, type AccountSessionUser } from "@/lib/client-session";
import { ButtonLink } from "@/app/components/ui";
import { SignedInSiteAccount } from "@/app/components/signed-in-site-account";
import type { SiteSection } from "@/app/components/site-navigation";

export function DefaultAccountWidget({ active }: { active: SiteSection }) {
  const [user, setUser] = useState<AccountSessionUser | null>(null);

  useEffect(() => {
    let activeEffect = true;
    void accountSession().then((sessionUser) => {
      if (!activeEffect) return;
      setUser(sessionUser);
    });
    return () => {
      activeEffect = false;
    };
  }, []);

  if (user) {
    return <SignedInSiteAccount user={user} />;
  }

  const returnTo = active === "home" ? "/" : `/${active}`;
  return <GuestSignInLink returnTo={returnTo} />;
}

/**
 * The guest call to action. In the navigation bar the label shortens to "Sign in" on phones
 * (the accessible name stays "Sign in with Google"); pass `abbreviate={false}` where there is room.
 */
export function GuestSignInLink({ returnTo, abbreviate = true }: { returnTo: string; abbreviate?: boolean }) {
  return (
    <ButtonLink
      aria-label={abbreviate ? "Sign in with Google" : undefined}
      className="site-account-link"
      href={signInHref(returnTo)}
      native
      size="sm"
    >
      {abbreviate ? (
        <>
          <span className="site-signin-full">Sign in with Google</span>
          <span aria-hidden="true" className="site-signin-short">Sign in</span>
        </>
      ) : "Sign in with Google"}
    </ButtonLink>
  );
}
