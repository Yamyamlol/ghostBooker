import { useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { getAirports, getStatus, previewRoutes, searchFares } from './api'
import type { Airport, CandidatesResponse, SearchResponse, Status } from './api'
import { AirportInput } from './AirportInput'
import { localDate } from './format'
import { PreviewResults, SearchResults } from './Results'

type Result = { kind: 'search'; data: SearchResponse } | { kind: 'preview'; data: CandidatesResponse }

export default function App() {
  const [airports, setAirports] = useState<Airport[]>([])
  const [status, setStatus] = useState<Status | null>(null)
  const [origin, setOrigin] = useState('DEL')
  const [destination, setDestination] = useState('CCU')
  const [date, setDate] = useState(localDate(30))
  const [limit, setLimit] = useState(5)
  const [busy, setBusy] = useState<'search' | 'preview' | null>(null)
  const [error, setError] = useState('')
  const [result, setResult] = useState<Result | null>(null)

  useEffect(() => {
    getAirports().then(setAirports).catch(() => {})
    getStatus().then(setStatus).catch(() => {})
  }, [])

  const placeName = useMemo(() => {
    const byCode = new Map(airports.map((a) => [a.iata, a.city ?? a.name]))
    return (iata: string) => byCode.get(iata) ?? ''
  }, [airports])

  async function run(kind: 'search' | 'preview') {
    setBusy(kind)
    setError('')
    try {
      const input = { origin, destination, date, limit }
      setResult(
        kind === 'search'
          ? { kind, data: await searchFares(input) }
          : { kind, data: await previewRoutes(input) },
      )
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(null)
    }
  }

  const onSubmit = (e: FormEvent) => {
    e.preventDefault()
    run('search')
  }

  return (
    <main className="app">
      <header className="top">
        <span className="brand">ghostBooker</span>
        {status && (
          <span className="muted small">
            {status.graph.flights ? `${status.graph.flights.toLocaleString('en-IN')} flights` : 'No schedule loaded'}
          </span>
        )}
      </header>

      <p className="lede">Cheaper tickets that stop where you're actually going.</p>

      <form onSubmit={onSubmit} className="form">
        <div className="pair">
          <AirportInput id="origin" label="From" value={origin} airports={airports} onChange={setOrigin} />
          <button
            type="button"
            className="swap"
            aria-label="Swap from and to"
            onClick={() => {
              setOrigin(destination)
              setDestination(origin)
            }}
          >
            ⇄
          </button>
          <AirportInput id="destination" label="To" value={destination} airports={airports} onChange={setDestination} />
        </div>

        <div className="pair pair-date">
          <div className="field">
            <label htmlFor="date">Date</label>
            <input id="date" type="date" value={date} min={localDate()} onChange={(e) => setDate(e.target.value)} required />
          </div>
          <div className="field">
            <label htmlFor="limit">Check</label>
            <input
              id="limit"
              type="number"
              inputMode="numeric"
              min={1}
              max={20}
              value={limit}
              onChange={(e) => setLimit(Number(e.target.value))}
              required
            />
          </div>
        </div>

        <button type="submit" className="primary" disabled={busy !== null}>
          {busy === 'search' ? 'Checking fares…' : 'Find fares'}
        </button>
        <div className="form-foot">
          <span className="muted small">Uses up to {limit + 1} live fare lookups</span>
          <button type="button" className="link" disabled={busy !== null} onClick={() => run('preview')}>
            {busy === 'preview' ? 'Loading…' : 'Preview routes'}
          </button>
        </div>
      </form>

      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}

      <div aria-live="polite">
        {result?.kind === 'search' && <SearchResults data={result.data} placeName={placeName} />}
        {result?.kind === 'preview' && <PreviewResults data={result.data} placeName={placeName} />}
      </div>

      <p className="note">
        Carry-on only and one-way only. Skipping the rest of a ticket can break airline rules.
      </p>
    </main>
  )
}
