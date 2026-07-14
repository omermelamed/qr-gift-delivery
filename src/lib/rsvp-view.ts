export type RsvpViewParams = {
  supportsArrival: boolean
  attending: boolean | null
  editing: boolean
  allowGiftIfNotAttending: boolean
  rsvpLocked: boolean
}

export type RsvpViewState = {
  showRsvpForm: boolean
  showEventFull: boolean
  showNotComing: boolean
}

/**
 * Decides which panel GiftRedemptionView shows for arrival-certificate
 * campaigns: the RSVP form, the "not coming" message, an "event full"
 * message when rsvpLocked has frozen new yes-answers, or (implicitly, when
 * all three are false) the gift picker / QR view.
 */
export function resolveRsvpViewState(params: RsvpViewParams): RsvpViewState {
  const { supportsArrival, attending, editing, allowGiftIfNotAttending, rsvpLocked } = params

  if (!supportsArrival) {
    return { showRsvpForm: false, showEventFull: false, showNotComing: false }
  }

  // A token is exempt from the lock only while it currently reads attending = true.
  const lockedOut = rsvpLocked && attending !== true
  const wantsFormOrChange = attending === null || editing

  return {
    showRsvpForm: !lockedOut && wantsFormOrChange,
    showEventFull: lockedOut,
    showNotComing: attending === false && !allowGiftIfNotAttending && !editing && !lockedOut,
  }
}
