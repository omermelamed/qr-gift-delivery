---
name: supabase-nextjs
description: Opinionated guidance for using Supabase with Next.js App Router — client setup, server vs browser clients, RLS, Realtime subscriptions, and Storage. Use when implementing any Supabase interaction in this project.
---

# Supabase + Next.js

## Client setup

Two distinct clients — never mix them:

```ts
// lib/supabase/server.ts — for API routes and server components
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export function createClient() {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { ... } }
  )
}

// For service-role operations (token validation, SMS send):
export function createServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!  // never expose to browser
  )
}
```

```ts
// lib/supabase/browser.ts — for client components and hooks
import { createBrowserClient } from '@supabase/ssr'

export const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)
```

## Atomic token redemption pattern

Never read-then-write. Use a single UPDATE:

```ts
const { data, error } = await supabase
  .from('gift_tokens')
  .update({ redeemed: true, redeemed_at: new Date().toISOString(), redeemed_by: distributorId })
  .eq('token', token)
  .eq('redeemed', false)
  .select('employee_name')
  .single()

if (!data) {
  // check if token exists at all to distinguish invalid vs already-used
}
```

## Realtime subscription pattern

```ts
useEffect(() => {
  const channel = supabase
    .channel('campaign-redemptions')
    .on('postgres_changes', {
      event: 'UPDATE',
      schema: 'public',
      table: 'gift_tokens',
      filter: `campaign_id=eq.${campaignId}`
    }, (payload) => {
      // update local state
    })
    .subscribe()

  return () => { supabase.removeChannel(channel) }
}, [campaignId])
```

## RLS policy shape

```sql
-- Admins can read/write all rows
CREATE POLICY "admin_all" ON gift_tokens
  FOR ALL USING (auth.jwt() ->> 'role' = 'admin');

-- Distributors can update tokens (redemption only)
CREATE POLICY "distributor_update" ON gift_tokens
  FOR UPDATE USING (auth.jwt() ->> 'role' = 'distributor');

-- Distributors can read tokens for scan confirmation
CREATE POLICY "distributor_read" ON gift_tokens
  FOR SELECT USING (auth.jwt() ->> 'role' = 'distributor');
```

## Storage pattern for QR images

```ts
const { data } = await supabase.storage
  .from('qr-codes')
  .upload(`${campaignId}/${token}.png`, pngBuffer, {
    contentType: 'image/png',
    upsert: false
  })

const { data: { publicUrl } } = supabase.storage
  .from('qr-codes')
  .getPublicUrl(`${campaignId}/${token}.png`)
```

## Anti-patterns

- never use service-role key in browser client
- never read a token then write — always atomic UPDATE
- never forget to remove Realtime channel on component unmount
