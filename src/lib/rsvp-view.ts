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

export function resolveRsvpViewState(params: RsvpViewParams): RsvpViewState {
  const { supportsArrival, attending, editing, allowGiftIfNotAttending, rsvpLocked } = params

  if (!supportsArrival) {
    return { showRsvpForm: false, showEventFull: false, showNotComing: false }
  }

  // A token is exempt from the lock only while it currently reads attending = true.
  const lockedOut = rsvpLocked && attending !== true
  const wantsFormOrChange = attending === null || editing
  const wouldShowNotComing = attending === false && !allowGiftIfNotAttending && !editing

  return {
    showRsvpForm: !lockedOut && wantsFormOrChange,
    showEventFull: lockedOut && (wantsFormOrChange || wouldShowNotComing),
    showNotComing: wouldShowNotComing && !lockedOut,
  }
}
