# Supabase security findings — 2026-08-30

Project ref: `xgmmpcyroxldhjxzywof`.

## Applied changes

- Applied migration `jarbou3_security_advisors_cleanup` to keep server-only tables behind explicit deny policies for `anon` and `authenticated`, revoke direct table privileges, and restrict `create_admin_access_recovery_token()` to `service_role`.
- Applied migration `jarbou3_privacy_consents` creating owner-only, versioned privacy consent storage with RLS.
- Added shared Arabic privacy policy text/version and protected client-side consent gate.
- Confirmed orders already have ownership policies: customer can access own orders, driver can access assigned orders, and active offer visibility is controlled by server-side logic.
- Confirmed `order_live_locations` policies restrict reads to the customer/driver assigned to the order; driver GPS RPC uses `auth.uid()`.
- Confirmed mobile foreground/background GPS uses `distanceInterval: 10` meters and the customer tracking screen uses Realtime first with 30-second fallback polling.

## Remaining Supabase advisor notices

The post-migration security advisor no longer reports tables with RLS enabled but no policies. Remaining notices were:

- `pg_net` extension is installed in the public schema; remediation: https://supabase.com/docs/guides/database/database-linter?lint=0014_extension_in_public
- Several intentionally protected `SECURITY DEFINER` RPCs remain executable by `authenticated`, including order acceptance/decline, customer trip path, driver live location, delivery OTP, and own balance functions. These functions are used by the authenticated app and contain ownership checks; revoking authenticated execution would break legitimate app flows, so they require a deliberate function-by-function review rather than a blanket revoke.
- Supabase Auth leaked-password protection is disabled; remediation: https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection
