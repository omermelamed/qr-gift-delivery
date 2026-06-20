# Supabase auth email setup

Email auth links (invite / password reset / magic link) must point at our
server-side confirmation route `/auth/confirm`, which verifies the token and
sets the session cookie before redirecting. Do NOT use the default
`{{ .ConfirmationURL }}` — it uses the PKCE `?code=` flow that fails when the
email is opened in a browser that didn't start the flow (the symptom: clicking
the link "does nothing").

## 1. Site URL (required)

Supabase → **Authentication → URL Configuration → Site URL**:
```
https://qr-gift-delivery.vercel.app
```
(Redirect URLs already allow `https://qr-gift-delivery.vercel.app/**`.)

## 2. Email templates

Supabase → **Authentication → Email Templates**. Edit each "Message body":

### Invite user
```html
<h2>You're invited to GiftFlow</h2>
<p>You've been invited to join GiftFlow. Click the button below to set your password and finish setting up your account.</p>
<p><a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=invite&next=/reset-password">Accept invite &amp; set your password</a></p>
```

### Reset password (Recovery)
```html
<h2>Reset your GiftFlow password</h2>
<p>Click the button below to choose a new password.</p>
<p><a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery&next=/reset-password">Set a new password</a></p>
```

### Magic Link (used when re-inviting an existing user)
```html
<h2>Sign in to GiftFlow</h2>
<p>Click the button below to sign in.</p>
<p><a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=magiclink&next=/admin">Sign in</a></p>
```

## How it flows
1. User clicks the single button → `GET /auth/confirm?token_hash=…&type=…&next=…`
2. `src/app/auth/confirm/route.ts` calls `verifyOtp({ type, token_hash })`, which
   sets the session cookie.
3. Redirects to `next` (`/reset-password` for invite/recovery → set-password
   form; `/admin` for magic link).

Each template now has ONE clear action and no bare app URL to confuse people.
