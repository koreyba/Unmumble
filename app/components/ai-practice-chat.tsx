"use client";

import { type ReactNode, useEffect, useState } from "react";
import { BookmarkPlusIcon, MessageIcon, TranslateIcon } from "@/app/components/ai-chat-icons";
import { ChatWorkspace } from "@/app/components/ai-chat-workspace";
import { GuestSignInLink } from "@/app/components/default-account-widget";
import { SignedInSiteAccount } from "@/app/components/signed-in-site-account";
import { SiteNavigation } from "@/app/components/site-navigation";
import { ButtonLink, Spinner, buttonClassName } from "@/app/components/ui";
import { accountSession, signInHref, type AccountSessionUser } from "@/lib/client-session";

function SignInCard({ returnTo }: Readonly<{ returnTo: string }>) {
  return (
    <section aria-labelledby="ai-chat-sign-in-title" className="ai-chat-sign-in">
      <div className="ai-chat-sign-in-copy">
        <span aria-hidden="true" className="ai-chat-sign-in-icon"><MessageIcon /></span>
        <h2 id="ai-chat-sign-in-title">Keep the words and the conversation together</h2>
        <p>Sign in with Google to start and keep your practice chats.</p>
        <ButtonLink
          className="ai-chat-sign-in-action"
          href={signInHref(returnTo)}
          native
          pill
          size="lg"
          variant="primary"
        >
          Sign in with Google
        </ButtonLink>
      </div>
      <div aria-hidden="true" className="ai-chat-sign-in-preview">
        <div className="ai-chat-message user">
          <span className="ai-chat-message-role">You</span>
          <span>Teach me <b>resilient</b> with an example.</span>
        </div>
        <div className="ai-chat-message assistant">
          <span className="ai-chat-message-role">Unmumble AI</span>
          <span>
            She is a <b>resilient</b> leader: she bounces back after every setback.
          </span>
        </div>
        <div className="ai-chat-sign-in-preview-actions">
          <span className={buttonClassName({ size: "sm" })}><TranslateIcon /> Translate</span>
          <span className={buttonClassName({ size: "sm", variant: "primary" })}><BookmarkPlusIcon /> Add to learning</span>
        </div>
      </div>
    </section>
  );
}

export function AiPracticeChat() {
  const [viewer, setViewer] = useState<AccountSessionUser | null>(null);
  const [sessionReady, setSessionReady] = useState(false);
  const [returnTo, setReturnTo] = useState("/chat");

  useEffect(() => {
    let active = true;
    void accountSession().then((user) => {
      if (!active) return;
      setReturnTo(`${window.location.pathname}${window.location.search}`);
      setViewer(user);
      setSessionReady(true);
    });
    return () => {
      active = false;
    };
  }, []);

  let account: ReactNode;
  if (viewer) account = <SignedInSiteAccount user={viewer} />;
  else if (sessionReady) account = <GuestSignInLink returnTo={returnTo} />;
  else account = <span aria-live="polite" className="site-account-name">Checking account…</span>;

  let chatState = "guest";
  if (!sessionReady) chatState = "checking";
  else if (viewer) chatState = "signed-in";

  let content: ReactNode;
  if (!sessionReady) {
    content = (
      <div aria-live="polite" className="ai-chat-account-state" role="status">
        <Spinner />
        <span>Checking your account…</span>
      </div>
    );
  } else if (viewer) {
    content = <ChatWorkspace />;
  } else {
    content = <SignInCard returnTo={returnTo} />;
  }

  return (
    <>
      <SiteNavigation active="chat" account={account} />
      <main className="ai-chat-shell" data-chat-state={chatState}>
        <section className="ai-chat-intro" aria-labelledby="ai-chat-title">
          <div>
            <p className="ai-chat-kicker">AI vocabulary practice</p>
            <h1 id="ai-chat-title">Turn words into conversation</h1>
          </div>
          <p>Practice in context, then select any useful phrase to translate or add to learning.</p>
        </section>
        {content}
      </main>
    </>
  );
}
