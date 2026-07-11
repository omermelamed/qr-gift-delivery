// Shared source of truth for the "how it works" journey. Both the interactive
// step rail (LandingPage) and the how-it-works video-placeholder modal
// (HowItWorksModal) render from this array, so the copy only lives in one
// place and stays in sync.
export const STEPS = [
  {
    title: 'Upload your employee list',
    body: 'A CSV file is all it takes — your campaign is ready in minutes.',
  },
  {
    title: 'Everyone gets a personal QR',
    body: 'Sent by SMS. Nothing to install, nothing to print.',
  },
  {
    title: 'Scan and watch it live',
    body: 'Each code redeems exactly once, and the dashboard updates as gifts are handed out.',
  },
] as const
