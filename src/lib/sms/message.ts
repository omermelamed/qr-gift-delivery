interface GiftSmsBodyOptions {
  employeeName: string
  holidayName: string
  giftLink: string
}

/**
 * Default gift SMS body, used when a campaign/company has no custom template.
 */
export function buildGiftSmsBody({ employeeName, holidayName, giftLink }: GiftSmsBodyOptions): string {
  return `Hi ${employeeName}! You have a ${holidayName} gift waiting for you. Open the link to get your QR code: ${giftLink}`
}
