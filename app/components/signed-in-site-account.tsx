import { ButtonLink } from "@/app/components/ui";
import { SIGN_OUT_HREF, type AccountSessionUser } from "@/lib/client-session";

export function SignedInSiteAccount({ user }: { user: AccountSessionUser }) {
  return (
    <>
      <span className="site-account-name" title={user.email}>{user.email}</span>
      <ButtonLink className="site-account-link" href={SIGN_OUT_HREF} native quietDanger size="sm" variant="ghost">Sign out</ButtonLink>
    </>
  );
}
