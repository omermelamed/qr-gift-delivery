type ArrivalRow = { attending: boolean | null; attendee_count: number | null; arrived_count?: number | null }

export type ArrivalSummary = {
  approved: number
  totalArriving: number
  notComing: number
  noResponse: number
  /** Sum of actual headcounts recorded by distributors at pickup. */
  actualArrived: number
}

export function summarizeArrival(rows: ArrivalRow[]): ArrivalSummary {
  let approved = 0
  let totalArriving = 0
  let notComing = 0
  let noResponse = 0
  let actualArrived = 0
  for (const r of rows) {
    if (r.attending === true) {
      approved++
      totalArriving += r.attendee_count ?? 0
    } else if (r.attending === false) {
      notComing++
    } else {
      noResponse++
    }
    if (r.arrived_count != null) actualArrived += r.arrived_count
  }
  return { approved, totalArriving, notComing, noResponse, actualArrived }
}
