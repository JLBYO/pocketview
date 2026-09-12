# Shared Personal Account

Pocketview's public sign-in page uses the same approved email/password account as
the Personal Life Assistant. There is no public registration or second password
database. Password setup/recovery opens Pocketview's `/recover` form. It sends a
recovery email through the shared provider, using only the approved account and
the server-configured assistant callback. The newest email link opens the
assistant's password form; if its dashboard appears, select **Password** in the
status bar. Return to Pocketview and sign in with the updated shared password.
Email failures and sending quotas are shown explicitly; sending is never retried
automatically. No password is changed just by requesting an email.

## Server Boundary

`worker/account-auth.ts` guards workspace documents and APIs before Vinext renders
them. It validates access tokens with Supabase `/auth/v1/user`, requiring the
configured owner ID, exact confirmed email and a server-controlled storage key.
Client-supplied identity headers and editable user metadata never authorize access.

Runtime configuration is held in Sites environment settings, not committed:

- `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`: the shared Auth project.
- `POCKETVIEW_OWNER_ID`, `POCKETVIEW_OWNER_EMAIL`: the approved owner allowlist.
- `POCKETVIEW_DATA_OWNER`: the previous Pocketview storage owner, retained unchanged.
- `PERSONAL_ASSISTANT_LOGIN_URL`: the verified recovery entry point.

Provider requests use Workers-compatible `redirect: "manual"` and reject all
redirect responses without forwarding credentials. Runtime regressions are tested
against the compiled Worker in Wrangler's local Cloudflare runtime, in addition to
Node unit tests. Error logs contain only operation/status/code, never credentials,
account emails, provider messages, or transaction data.

Missing configuration locks the application. Deploy and test the guarded version
before changing the outer Sites audience to public. Public assets must never
contain transaction data, credentials, exports or backups.

## Sessions And Local History

Password grants and refreshes happen server-side. Access/refresh cookies are
Secure, HttpOnly, host-only and SameSite=Lax. Passwords and tokens are never saved
to browser JavaScript storage. Refresh cookies expire after 14 idle days; provider
session policies also apply. Login/logout require same-origin POST. Sign-out calls
provider logout with `scope=local`, leaving the assistant's other sessions alone.
If the provider is unreachable or the access cookie has expired, local cookies
are still cleared; remote token expiry/revocation follows provider policy.

The client checks sign-in on opening, focus and every minute while visible. A
failed check hides the workspace while preserving drafts in memory. Sign in in
another tab and return to recover from an expired session. The login is not disk
encryption: IndexedDB history remains in this browser after signing out. Use a
locked personal device and encrypted history backups. Signing in does not sync
transaction databases between devices.

References: [Supabase password authentication](https://supabase.com/docs/guides/auth/passwords)
and [Auth REST contract](https://github.com/supabase/auth/blob/master/openapi.yaml).
