import { useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { getAirports, getStatus, previewRoutes, searchFares } from './api'
import type { Airport, CandidatesResponse, SearchResponse, Status } from './api'
import { AirportInput } from './AirportInput'
import { localDate } from './format'
import { PreviewResults, SearchResults } from './Results'
import { ThemeToggle } from './ThemeToggle'
import { inputClass, labelClass } from './ui'

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
    // One screen on wide displays: the form column and the results panel scroll on their own, never the page
    <div className="flex min-h-dvh flex-col lg:h-dvh">
      <header className="flex h-14 shrink-0 items-center justify-between border-b border-line px-4 lg:px-8">
        <span className="font-semibold tracking-tight">ghostBooker</span>
        <div className="flex items-center gap-3">
          {status && (
            <span className="text-[13px] text-muted">
              {status.graph.flights ? `${status.graph.flights.toLocaleString('en-IN')} flights` : 'No schedule loaded'}
            </span>
          )}
          <ThemeToggle />
        </div>
      </header>

      <main className="flex-1 lg:grid lg:min-h-0 lg:grid-cols-[minmax(360px,420px)_1fr]">
        <section className="flex flex-col px-4 pt-6 lg:overflow-y-auto lg:border-r lg:border-line lg:px-8 lg:pt-10 lg:pb-6">
          <p className="mb-6 text-xl leading-tight tracking-tight lg:mb-8 lg:text-2xl">
            Cheaper tickets that stop where you're actually going.
          </p>

          <form onSubmit={onSubmit} className="grid gap-3.5">
            <div className="relative grid grid-cols-[1fr_32px_1fr] items-start gap-2">
              <AirportInput id="origin" label="From" value={origin} airports={airports} onChange={setOrigin} />
              <button
                type="button"
                aria-label="Swap from and to"
                className="mt-6 h-[46px] cursor-pointer text-lg text-muted hover:text-fg"
                onClick={() => {
                  setOrigin(destination)
                  setDestination(origin)
                }}
              >
                ⇄
              </button>
              <AirportInput id="destination" label="To" value={destination} airports={airports} onChange={setDestination} />
            </div>

            <div className="grid grid-cols-[1fr_76px] gap-3">
              <div>
                <label htmlFor="date" className={labelClass}>
                  Date
                </label>
                <input
                  id="date"
                  type="date"
                  className={`${inputClass} text-base`}
                  value={date}
                  min={localDate()}
                  onChange={(e) => setDate(e.target.value)}
                  required
                />
              </div>
              <div>
                <label htmlFor="limit" className={labelClass}>
                  Check
                </label>
                <input
                  id="limit"
                  type="number"
                  inputMode="numeric"
                  className={`${inputClass} text-base`}
                  min={1}
                  max={20}
                  value={limit}
                  onChange={(e) => setLimit(Number(e.target.value))}
                  required
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={busy !== null}
              className="mt-1 h-[50px] cursor-pointer rounded-lg bg-fg font-medium text-bg disabled:cursor-default disabled:opacity-60"
            >
              {busy === 'search' ? 'Checking fares…' : 'Find fares'}
            </button>
            <div className="flex items-center justify-between">
              <span className="text-[13px] text-muted">Uses up to {limit + 1} live fare lookups</span>
              <button
                type="button"
                disabled={busy !== null}
                onClick={() => run('preview')}
                className="cursor-pointer py-1.5 text-[13px] underline decoration-line underline-offset-[3px] hover:decoration-current"
              >
                {busy === 'preview' ? 'Loading…' : 'Preview routes'}
              </button>
            </div>
          </form>

          {error && (
            <p role="alert" className="mt-4 text-sm text-danger">
              {error}
            </p>
          )}

          <p className="mt-8 text-xs text-muted lg:mt-auto lg:pt-8">
            Carry-on only and one-way only. Skipping the rest of a ticket can break airline rules.
          </p>
        </section>

        <section aria-live="polite" className="px-4 pt-8 pb-10 lg:min-h-0 lg:overflow-y-auto lg:px-10 lg:pt-10">
          {result?.kind === 'search' && <SearchResults data={result.data} placeName={placeName} />}
          {result?.kind === 'preview' && <PreviewResults data={result.data} placeName={placeName} />}
          {!result && (
            <p className="hidden h-full items-center justify-center text-sm text-muted lg:flex">
              {busy ? 'Checking fares…' : 'Results show up here.'}
            </p>
          )}
        </section>
      </main>
    </div>
  )
}
