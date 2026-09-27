"use client";

import { useCallback, useEffect, useState } from "react";
import { SignedInSiteAccount } from "@/app/components/signed-in-site-account";
import { NativeLanguageCombobox, type NativeLanguageOption } from "@/app/components/native-language-combobox";
import { SiteNavigation } from "@/app/components/site-navigation";
import {
  accountSession,
  signInHref,
  type AccountSessionUser,
} from "@/lib/client-session";

type Integration = {
  provider: "deepl";
  label: string;
  configured: boolean;
  source: "integrations" | "default" | null;
};
type IntegrationsResponse = { integrations?: Integration[]; error?: string };
type LanguageResponse = { nativeLanguage?: string; languages?: NativeLanguageOption[]; error?: string };

export default function IntegrationsPage() {
  const [session, setSession] = useState<AccountSessionUser | null>(null);
  const [integration, setIntegration] = useState<Integration | null>(null);
  const [key, setKey] = useState("");
  const [nativeLanguage, setNativeLanguage] = useState("ru");
  const [languages, setLanguages] = useState<NativeLanguageOption[]>([]);
  const [savingLanguage, setSavingLanguage] = useState(false);
  const [languageError, setLanguageError] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const loadStatus = useCallback(async () => {
    const response = await fetch("/api/integrations", { cache: "no-store" });
    const data = await response.json() as IntegrationsResponse;
    if (!response.ok) throw new Error(data.error || "Could not check integrations.");
    setIntegration(data.integrations?.[0] || null);
  }, []);

  const loadLanguages = useCallback(async () => {
    const response = await fetch("/api/settings/native-language", { cache: "no-store" });
    const data = await response.json() as LanguageResponse;
    if (!response.ok) throw new Error(data.error || "Could not load available languages.");
    setNativeLanguage(data.nativeLanguage || "ru");
    setLanguages(data.languages || []);
    setLanguageError("");
  }, []);

  useEffect(() => {
    void (async () => {
      try {
        const currentSession = await accountSession();
        setSession(currentSession);
        if (currentSession) {
          await Promise.all([
            loadStatus(),
            loadLanguages().catch((reason) => {
              setLanguageError(reason instanceof Error ? reason.message : "Could not load available languages.");
            }),
          ]);
        }
      } catch (reason) {
        setError(reason instanceof Error ? reason.message : "Could not check integrations.");
      } finally {
        setLoading(false);
      }
    })();
  }, [loadStatus, loadLanguages]);

  async function saveLanguage(code: string) {
    if (code === nativeLanguage) return;
    setSavingLanguage(true);
    setLanguageError("");
    setNotice("");
    try {
      const response = await fetch("/api/settings/native-language", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nativeLanguage: code }),
      });
      const data = await response.json() as LanguageResponse;
      if (!response.ok) throw new Error(data.error || "Could not save native language.");
      setNativeLanguage(data.nativeLanguage || code);
      setNotice("Native language saved. New translations will use it.");
    } catch (reason) {
      setLanguageError(reason instanceof Error ? reason.message : "Could not save native language.");
    } finally {
      setSavingLanguage(false);
    }
  }

  async function saveKey() {
    if (!key.trim()) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/integrations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider: "deepl", key: key.trim() }),
      });
      const data = await response.json() as IntegrationsResponse & { error?: string };
      if (!response.ok) throw new Error(data.error || "Could not save the API key.");
      setKey("");
      setIntegration((current) => current
        ? { ...current, configured: true, source: "integrations" }
        : { provider: "deepl", label: "DeepL", configured: true, source: "integrations" });
      setNotice("Personal key saved. It will be used instead of the default key.");
      await loadLanguages().catch((reason) => {
        setLanguages([]);
        setLanguageError(reason instanceof Error ? reason.message : "Could not load available languages.");
      });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not save the API key.");
    } finally {
      setBusy(false);
    }
  }

  async function removeKey() {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/integrations?provider=deepl", { method: "DELETE" });
      const data = await response.json() as IntegrationsResponse & { error?: string };
      if (!response.ok) throw new Error(data.error || "Could not delete the API key.");
      const updated = data.integrations?.[0];
      setIntegration((current) => current
        ? {
            ...current,
            configured: updated?.configured ?? false,
            source: updated?.source ?? null,
          }
        : null);
      setNotice(
        updated?.source === "default"
          ? "Personal key removed. The shared beta key is now active."
          : "The key saved on this page was deleted."
      );
      await loadLanguages().catch((reason) => {
        setLanguages([]);
        setLanguageError(reason instanceof Error ? reason.message : "Could not load available languages.");
      });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not delete the API key.");
    } finally {
      setBusy(false);
    }
  }

  const sourceText = integration?.source === "integrations"
    ? "The key is encrypted and saved only for this account."
    : integration?.source === "default"
      ? "Using the shared beta translation key. You can also connect your own key below."
      : "The key is not configured yet.";

  if (loading) {
    return (
      <>
        <SiteNavigation active="settings" account={<span aria-live="polite" className="site-account-name">Checking account…</span>} />
        <main className="integrations-shell">
          <p className="eyebrow">Unmumble</p>
          <h1>Settings</h1>
          <p className="integrations-intro" role="status">Checking your account…</p>
        </main>
      </>
    );
  }

  if (!session) {
    return (
      <>
        <SiteNavigation
          active="settings"
          account={<a className="site-account-link" href={signInHref("/settings")}>Sign in with Google</a>}
        />
        <main className="integrations-shell">
          <p className="eyebrow">Unmumble</p>
          <h1>Settings</h1>
          <p className="integrations-intro">Your learning pages remain available in guest mode.</p>
          <section className="integration-card" aria-labelledby="settings-sign-in-title">
            <div className="integration-card-heading">
              <div>
                <p className="integration-label">Account settings</p>
                <h2 id="settings-sign-in-title">Sign in to manage integrations</h2>
                <p>Connect DeepL and keep its encrypted API key with your account.</p>
              </div>
            </div>
            <div className="integration-actions">
              <a className="site-account-link" href={signInHref("/settings")}>Sign in with Google</a>
            </div>
          </section>
        </main>
      </>
    );
  }

  return (
    <>
      <SiteNavigation
        active="settings"
        account={<SignedInSiteAccount user={session} />}
      />
      <main className="integrations-shell">
      <p className="eyebrow">Unmumble</p>
      <h1>Settings</h1>
      <p className="integrations-intro">Connect services that help you learn. Keys are never returned to the browser after saving.</p>

      {error && <div className="notice error" role="alert">{error}</div>}
      {notice && <div className="notice success" role="status">{notice}</div>}

      <div className="settings-card-stack">
      <section className="integration-card native-language-card" aria-labelledby="native-language-title">
        <div className="integration-card-heading">
          <div>
            <p className="integration-label">Language</p>
            <h2 id="native-language-title">Native Language</h2>
            <p>Choose the language for new DeepL translations.</p>
          </div>
        </div>
        <div className="native-language-field">
          <NativeLanguageCombobox
            languages={languages}
            value={nativeLanguage}
            disabled={savingLanguage || languages.length === 0}
            onSelect={(code) => void saveLanguage(code)}
          />
          {savingLanguage && <span className="native-language-status" role="status">Saving…</span>}
          {languageError && <p className="native-language-error" role="alert">{languageError}</p>}
          {!languageError && languages.length === 0 && (
            <p className="native-language-hint">Connect DeepL to choose a language.</p>
          )}
          <p className="native-language-hint">Saved translations keep their current language.</p>
        </div>
      </section>

      <section className="integration-card" aria-labelledby="deepl-title">
        <div className="integration-card-heading">
          <div>
            <p className="integration-label">Translation</p>
            <h2 id="deepl-title">DeepL</h2>
            <p>Translate English phrases into your native language.</p>
          </div>
          <span className={integration?.configured ? "integration-status configured" : "integration-status"}>
            {loading ? "Checking…" : integration?.configured ? (integration?.source === "default" ? "Connected (Beta)" : "Connected") : "Not connected"}
          </span>
        </div>

        <p className="integration-source">{sourceText}</p>
        <div className="integration-form">
          <label htmlFor="deepl-key">
            {integration?.source === "default" ? "Personal DeepL API key (optional)" : "DeepL API key"}
          </label>
          <input
            autoComplete="new-password"
            id="deepl-key"
            onChange={(event) => setKey(event.target.value)}
            placeholder={
              integration?.source === "integrations"
                ? "Enter a replacement key"
                : integration?.source === "default"
                  ? "Paste your DeepL key to override default"
                  : "Paste your DeepL key"
            }
            type="password"
            value={key}
          />
          <div className="integration-actions">
            <button disabled={busy || !key.trim()} onClick={() => void saveKey()} type="button">
              {integration?.source === "integrations" ? "Replace key" : "Save key"}
            </button>
            {integration?.source === "integrations" && (
              <button className="secondary" disabled={busy} onClick={() => void removeKey()} type="button">
                Delete
              </button>
            )}
          </div>
        </div>
        <p className="integration-security">The key is sent over HTTPS, encrypted on the Worker with AES-GCM, and stored in D1. It is never included in API responses.</p>
      </section>
      </div>
      </main>
    </>
  );
}
