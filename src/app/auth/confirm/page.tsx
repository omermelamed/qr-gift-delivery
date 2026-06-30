// Interstitial for email auth links (invite / recovery / magic link).
//
// Email templates point here with ?token_hash=...&type=...&next=... . We do NOT
// verify the OTP on this GET — email security scanners (Gmail, Outlook, etc.)
// prefetch links and would burn the single-use token before the real user
// clicks. Instead we render a button that POSTs to /auth/confirm/verify; only a
// human submitting the form consumes the token.
export default async function ConfirmPage({
  searchParams,
}: {
  searchParams: Promise<{ token_hash?: string; type?: string; next?: string }>
}) {
  const { token_hash: tokenHash, type, next } = await searchParams
  const valid = Boolean(tokenHash && type)

  return (
    <main className="flex min-h-screen items-center justify-center bg-zinc-50 p-8" dir="rtl">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center gap-3 mb-8">
          <div className="w-12 h-12 rounded-2xl bg-brand" />
          <span className="text-xl font-bold text-zinc-900">GiftFlow</span>
        </div>

        <div className="bg-white rounded-2xl border border-zinc-200 shadow-sm p-8 flex flex-col gap-5 text-center">
          {valid ? (
            <>
              <h1 className="text-lg font-semibold text-zinc-900">השלמת הגדרת החשבון</h1>
              <p className="text-sm text-zinc-500 -mt-2">
                לחצו על הכפתור כדי להמשיך.
                <br />
                <span className="text-zinc-400">Click below to continue setting up your account.</span>
              </p>

              <form action="/auth/confirm/verify" method="POST" className="flex flex-col">
                <input type="hidden" name="token_hash" value={tokenHash} />
                <input type="hidden" name="type" value={type} />
                <input type="hidden" name="next" value={next ?? '/'} />
                <button
                  type="submit"
                  className="w-full bg-brand text-white rounded-lg px-4 py-2.5 text-sm font-semibold hover:brightness-110 transition-all"
                >
                  המשך · Continue
                </button>
              </form>
            </>
          ) : (
            <>
              <h1 className="text-lg font-semibold text-zinc-900">קישור לא תקין</h1>
              <p className="text-sm text-zinc-500">
                הקישור חסר או שפג תוקפו.{' '}
                <a href="/login" className="text-brand hover:underline">
                  חזרה להתחברות
                </a>
              </p>
            </>
          )}
        </div>
      </div>
    </main>
  )
}
