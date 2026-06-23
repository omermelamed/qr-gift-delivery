type ArrivalRow = { attending: boolean | null; attendee_count: number | null }

export type ArrivalSummary = {
  approved: number
  totalArriving: number
  notComing: number
  noResponse: number
}

export function summarizeArrival(rows: ArrivalRow[]): ArrivalSummary {
  let approved = 0
  let totalArriving = 0
  let notComing = 0
  let noResponse = 0
  for (const r of rows) {
    if (r.attending === true) {
      approved++
      totalArriving += r.attendee_count ?? 0
    } else if (r.attending === false) {
      notComing++
    } else {
      noResponse++
    }
  }
  return { approved, totalArriving, notComing, noResponse }
}
