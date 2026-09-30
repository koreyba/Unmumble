"use client";

import { useEffect, useRef, useState } from "react";
import { SiteNavigation } from "@/app/components/site-navigation";
import { Button, ButtonLink, Spinner } from "@/app/components/ui";
import { completeSignOut } from "@/lib/client-session";

export default function LogoutPage() {
  const started = useRef(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void completeSignOut().then((completed) => {
      if (!completed) setFailed(true);
    });
  }, []);

  return (
    <>
      <SiteNavigation active="library" account={null} />
      <main className="page-shell page-shell--narrow">
        <header className="page-header" role="status">
          <p className="eyebrow">Account</p>
          <h1>{failed ? "Could not sign out" : <>Signing you out <Spinner /></>}</h1>
          <p>
            {failed
              ? "Your Unmumble session could not be revoked. Retry, or return to the site without signing out."
              : "You will return to the library in a moment."}
          </p>
        </header>
        {failed && (
          <div className="page-actions">
            <Button onClick={() => window.location.reload()} variant="primary">Retry</Button>
            <ButtonLink href="/library">Return to Library</ButtonLink>
          </div>
        )}
      </main>
    </>
  );
}
