// SMS length / billing helpers.
//
// Our content is Hebrew, which forces UCS-2 (Unicode) encoding — and any Latin
// characters in the body (e.g. the gift URL) keep the whole message Unicode.
// InforU bills Hebrew SMS in units of 201 characters: a single billed message
// holds up to 201 chars (three concatenated 67-char UCS-2 segments), and every
// further 201 chars adds another billed message. Standard Unicode segment table:
//   ≤70 → 1 GSM segment, ≤134 → 2, ≤201 → 3, ≤268 → 4 (67 chars each after UDH).
//
// If InforU ever changes the billing step, this single constant is the only knob.
export const INFORU_CHARS_PER_MESSAGE = 201

/**
 * Number of SMS messages InforU bills for a final (already-substituted) body.
 * Empty body costs nothing; otherwise it is ceil(length / 201), min 1.
 * Length is measured in UTF-16 code units, which is what UCS-2 segmentation uses.
 */
export function messagesForLength(length: number): number {
  if (length <= 0) return 0
  return Math.ceil(length / INFORU_CHARS_PER_MESSAGE)
}

export function countSmsMessages(body: string): number {
  return messagesForLength(body.length)
}

// Buffers for the template editor's live estimate. The author types {name} and
// {link}, but those expand at send time — {link} becomes a ~60-char gift URL and
// {name} a real recipient name — so a counter on the raw template would lie. We
// project a realistic worst-ish case so the warning fires before a real send does.
export const SMS_NAME_BUFFER = 20 // a long full name
export const SMS_LINK_BUFFER = 70 // https://<host>/gift/<encoded-token> with headroom

/**
 * Projects a template's substituted length by replacing {name}/{link} with
 * buffer-sized placeholders. Callers may override the buffers (e.g. compute the
 * real link length from NEXT_PUBLIC_APP_URL) for a tighter estimate.
 */
export function projectTemplateLength(
  template: string,
  opts?: { nameLen?: number; linkLen?: number },
): number {
  const nameLen = opts?.nameLen ?? SMS_NAME_BUFFER
  const linkLen = opts?.linkLen ?? SMS_LINK_BUFFER
  return template
    .replaceAll('{name}', 'x'.repeat(nameLen))
    .replaceAll('{link}', 'x'.repeat(linkLen))
    .length
}
