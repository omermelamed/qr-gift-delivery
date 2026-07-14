import { describe, it, expect } from 'vitest'
import { resolveRsvpViewState } from '@/lib/rsvp-view'

const base = {
  supportsArrival: true,
  attending: null as boolean | null,
  editing: false,
  allowGiftIfNotAttending: false,
  rsvpLocked: false,
}

describe('resolveRsvpViewState', () => {
  it('hides everything when the campaign has no arrival certificates', () => {
    expect(resolveRsvpViewState({ ...base, supportsArrival: false, rsvpLocked: true, attending: false }))
      .toEqual({ showRsvpForm: false, showEventFull: false, showNotComing: false })
  })

  it('shows the RSVP form for an unanswered token when unlocked', () => {
    expect(resolveRsvpViewState({ ...base, attending: null }))
      .toEqual({ showRsvpForm: true, showEventFull: false, showNotComing: false })
  })

  it('shows the not-coming message when unlocked and gift-if-not-attending is off', () => {
    expect(resolveRsvpViewState({ ...base, attending: false }))
      .toEqual({ showRsvpForm: false, showEventFull: false, showNotComing: true })
  })

  it('falls through to the gift view when not attending but gift-if-not-attending is on', () => {
    expect(resolveRsvpViewState({ ...base, attending: false, allowGiftIfNotAttending: true }))
      .toEqual({ showRsvpForm: false, showEventFull: false, showNotComing: false })
  })

  it('falls through to the gift view when locked, declined, but gift-if-not-attending is on', () => {
    expect(resolveRsvpViewState({ ...base, attending: false, allowGiftIfNotAttending: true, rsvpLocked: true }))
      .toEqual({ showRsvpForm: false, showEventFull: false, showNotComing: false })
  })

  it('shows event-full for an unanswered token when locked', () => {
    expect(resolveRsvpViewState({ ...base, attending: null, rsvpLocked: true }))
      .toEqual({ showRsvpForm: false, showEventFull: true, showNotComing: false })
  })

  it('shows event-full (not the not-coming message) for a no-answer token when locked', () => {
    expect(resolveRsvpViewState({ ...base, attending: false, rsvpLocked: true }))
      .toEqual({ showRsvpForm: false, showEventFull: true, showNotComing: false })
  })

  it('still shows event-full for a locked-out token even while "editing"', () => {
    expect(resolveRsvpViewState({ ...base, attending: false, rsvpLocked: true, editing: true }))
      .toEqual({ showRsvpForm: false, showEventFull: true, showNotComing: false })
  })

  it('leaves an already-yes token unaffected by the lock', () => {
    expect(resolveRsvpViewState({ ...base, attending: true, rsvpLocked: true }))
      .toEqual({ showRsvpForm: false, showEventFull: false, showNotComing: false })
  })

  it('lets an already-yes token edit its headcount while locked', () => {
    expect(resolveRsvpViewState({ ...base, attending: true, rsvpLocked: true, editing: true }))
      .toEqual({ showRsvpForm: true, showEventFull: false, showNotComing: false })
  })
})
