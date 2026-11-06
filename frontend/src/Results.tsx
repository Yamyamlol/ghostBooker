import type { CandidatesResponse, SearchResponse, Segment } from './api'
import { clock, money } from './format'

type Props<T> = { data: T; placeName: (iata: string) => string }

const titleClass = 'text-[13px] font-medium text-muted'
const optionClass = 'border-b border-line py-4'
const priceClass = 'text-xl font-semibold tracking-tight'
// Ticket options sit two per row on very wide screens
const optionGridClass = 'grid xl:grid-cols-2 xl:gap-x-10'

function LegRow({ tag, flightNo, route }: { tag: 'Fly' | 'Skip'; flightNo: string; route: string }) {
  const skip = tag === 'Skip'
  return (
    <li className={`grid grid-cols-[34px_64px_1fr] items-baseline gap-2 ${skip ? 'text-muted' : ''}`}>
      <span className="text-[11px] tracking-wide text-muted uppercase">{tag}</span>
      <span className="font-mono text-[13px]">{flightNo}</span>
      <span className={skip ? 'line-through decoration-line' : ''}>{route}</span>
    </li>
  )
}

const segmentRoute = (s: Segment, date: string) => `${s.from} ${clock(s.departs, date)} → ${s.to} ${clock(s.arrives, date)}`

export function SearchResults({ data, placeName }: Props<SearchResponse>) {
  const { direct, options, checked, meta, origin, destination, date } = data
  const cheaper = options.filter((o) => (o.savingsVsDirect ?? 0) > 0).length
  const stops = direct?.flights.slice(0, -1).map((f) => f.to) ?? []

  return (
    <div className="max-w-5xl">
      <div className="flex items-center justify-between gap-4 border-y border-line py-3.5">
        <div className="text-[13px]">
          <div className="text-muted">Regular fare to {destination}</div>
          {direct ? (
            <>
              <div>
                {origin} {clock(direct.flights[0].departs, date)} → {destination}{' '}
                {clock(direct.flights.at(-1)!.arrives, date)} · {stops.length ? `via ${stops.join(', ')}` : 'nonstop'}
              </div>
              <div className="font-mono text-muted">{direct.flights.map((f) => f.flightNo).join(' · ')}</div>
            </>
          ) : (
            <div className="text-muted">{data.directError ?? 'No fare found'}</div>
          )}
        </div>
        {direct && <div className={priceClass}>{money(direct.price.amount, direct.price.currency)}</div>}
      </div>

      <h2 className={`mt-7 ${titleClass}`}>
        {options.length === 0
          ? `No tickets found that stop at ${destination}`
          : `${cheaper} of ${options.length} tickets through ${destination} cost less`}
      </h2>

      <ul className={optionGridClass}>
        {options.map((o, i) => (
          <li key={`${o.ticketTo}-${i}`} className={optionClass}>
            <div className="flex items-baseline justify-between gap-3">
              <span className={priceClass}>{money(o.price.amount, o.price.currency)}</span>
              {o.savingsVsDirect !== null &&
                (o.savingsVsDirect > 0 ? (
                  <span className="text-sm font-medium text-save">Save {money(o.savingsVsDirect, o.price.currency)}</span>
                ) : (
                  <span className="text-[13px] text-muted">{money(-o.savingsVsDirect, o.price.currency)} more</span>
                ))}
            </div>
            <div className="text-[13px] text-muted">
              Ticket to {o.ticketTo} {placeName(o.ticketTo) && `· ${placeName(o.ticketTo)}`}
              {o.hasMixedCarriers && ' · mixed airlines'}
            </div>
            <ul className="mt-2.5 grid gap-1 text-sm">
              {o.flightsToTake.map((s, j) => (
                <LegRow key={`t${j}`} tag="Fly" flightNo={s.flightNo} route={segmentRoute(s, date)} />
              ))}
              {o.flightsToSkip.map((s, j) => (
                <LegRow key={`s${j}`} tag="Skip" flightNo={s.flightNo} route={segmentRoute(s, date)} />
              ))}
            </ul>
          </li>
        ))}
      </ul>

      <details className="max-w-xl">
        <summary className="cursor-pointer py-4 text-[13px] text-muted">
          Checked {checked.length} destinations · {meta.fareApiCalls} live lookups, {meta.fareCacheHits} cached
        </summary>
        <ul>
          {checked.map((c) => (
            <li key={c.ticketTo} className="grid grid-cols-[44px_1fr_auto] gap-2 border-t border-line py-2 text-sm">
              <span className="font-mono">{c.ticketTo}</span>
              <span className="text-muted">{placeName(c.ticketTo)}</span>
              <span className="text-[13px]">
                {c.error
                  ? 'Lookup failed'
                  : c.hiddenCityMatches
                    ? `${c.hiddenCityMatches} via ${destination}`
                    : `None via ${destination}`}
              </span>
            </li>
          ))}
        </ul>
      </details>
    </div>
  )
}

export function PreviewResults({ data, placeName }: Props<CandidatesResponse>) {
  const { shortlist, notShortlisted, origin, destination } = data
  const total = shortlist.length + notShortlisted.length

  return (
    <div className="max-w-5xl">
      <h2 className={titleClass}>
        {total === 0
          ? `No scheduled routes continue past ${destination} that day`
          : `${shortlist.length} of ${total} destinations past ${destination} would be checked`}
      </h2>
      <ul className={optionGridClass}>
        {shortlist.map((c) => (
          <li key={c.destination} className={optionClass}>
            <div className="flex items-baseline justify-between gap-3">
              <span>
                <span className="font-mono font-semibold">{c.destination}</span>{' '}
                <span className="text-muted">{placeName(c.destination)}</span>
              </span>
              <span className="text-[13px] text-muted">
                {c.estimate ? `~${money(c.estimate.price, c.estimate.currency)}` : `+${c.bestPath.minutesBeyond} min flying`}
              </span>
            </div>
            <ul className="mt-2.5 grid gap-1 text-sm">
              {/* Onward-only candidates: the first flight isn't in the schedule, any flight to the destination works */}
              {c.bestPath.hiddenAt < 0 && <LegRow tag="Fly" flightNo="any" route={`${origin} → ${destination}`} />}
              {c.bestPath.legs.map((l, j) => (
                <LegRow
                  key={j}
                  tag={j > c.bestPath.hiddenAt ? 'Skip' : 'Fly'}
                  flightNo={l.flightNo}
                  route={`${l.from} ${l.departs} → ${l.to} ${l.arrives}`}
                />
              ))}
            </ul>
          </li>
        ))}
      </ul>
      {notShortlisted.length > 0 && (
        <p className="mt-4 text-[13px] leading-relaxed text-muted">
          Also reachable: <span className="font-mono">{notShortlisted.map((c) => c.destination).join(' ')}</span>
        </p>
      )}
    </div>
  )
}
