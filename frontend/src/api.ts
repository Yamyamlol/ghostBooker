export type Airport = { iata: string; name: string; city: string | null }

export type Price = { amount: number; currency: string; status?: string }
export type Estimate = { price: number; currency: string; observedAt: string } | null

export type Segment = {
  flightNo: string
  carrier: string | null
  from: string
  to: string
  departs: string
  arrives: string
}

export type Leg = {
  flightNo: string
  from: string
  to: string
  dayOffset: number
  departs: string
  arrives: string
}

export type Candidate = {
  destination: string
  pathCount: number
  estimate: Estimate
  // hiddenAt is -1 for onward-only candidates: the first flight isn't in the schedule, only the one to skip
  bestPath: { legs: Leg[]; hiddenAt: number; minutesBeyond: number; onwardOnly?: boolean }
}

export type OtherCandidate = { destination: string; pathCount: number; estimate: Estimate; minutesBeyond: number }

export type CandidatesResponse = {
  origin: string
  destination: string
  date: string
  pathsFound: number
  shortlist: Candidate[]
  notShortlisted: OtherCandidate[]
}

export type Option = {
  ticketTo: string
  price: Price
  savingsVsDirect: number | null
  flightsToTake: Segment[]
  flightsToSkip: Segment[]
  hasMixedCarriers: boolean | null
}

export type Checked = {
  ticketTo: string
  estimate: Estimate
  fromCache?: boolean
  hiddenCityMatches?: number
  error?: string
}

export type SearchResponse = {
  origin: string
  destination: string
  date: string
  direct: { price: Price; flights: Segment[] } | null
  directError?: string
  options: Option[]
  checked: Checked[]
  meta: { fareApiCalls: number; fareCacheHits: number; failedFareCalls: number }
}

export type Status = { graph: { flights: number; airports: number } }

export type SearchInput = { origin: string; destination: string; date: string; limit: number }

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response
  try {
    res = await fetch(`/api${path}`, init)
  } catch {
    throw new Error("Can't reach the backend. Is it running on port 3000?")
  }
  const body = await res.json().catch(() => null)
  if (!res.ok || !body?.success) throw new Error(body?.message ?? `Request failed (HTTP ${res.status})`)
  return body as T
}

export const getAirports = () => request<{ airports: Airport[] }>('/airports').then((b) => b.airports)

export const getStatus = () => request<Status>('/schedule/status')

export const previewRoutes = (q: SearchInput) =>
  request<CandidatesResponse>(`/flights/candidates?${new URLSearchParams({ ...q, limit: String(q.limit) })}`)

export const searchFares = (q: SearchInput) =>
  request<SearchResponse>('/flights/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(q),
  })
