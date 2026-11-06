import type { CandidatesResponse, SearchResponse, Segment } from './api'
import { clock, money } from './format'

type Props<T> = { data: T; placeName: (iata: string) => string }

function SegmentRow({ tag, s, date }: { tag: 'Fly' | 'Skip'; s: Segment; date: string }) {
  return (
    <li className={`leg ${tag === 'Skip' ? 'skip' : ''}`}>
      <span className="tag">{tag}</span>
      <span className="mono">{s.flightNo}</span>
      <span className="route">
        {s.from} {clock(s.departs, date)} → {s.to} {clock(s.arrives, date)}
      </span>
    </li>
  )
}

export function SearchResults({ data, placeName }: Props<SearchResponse>) {
  const { direct, options, checked, meta, origin, destination, date } = data
  const cheaper = options.filter((o) => (o.savingsVsDirect ?? 0) > 0).length
  const stops = direct?.flights.slice(0, -1).map((f) => f.to) ?? []

  return (
    <section className="results">
      <div className="direct">
        <div>
          <div className="small muted">Regular fare to {destination}</div>
          {direct ? (
            <>
              <div className="small">
                {origin} {clock(direct.flights[0].departs, date)} → {destination}{' '}
                {clock(direct.flights.at(-1)!.arrives, date)} · {stops.length ? `via ${stops.join(', ')}` : 'nonstop'}
              </div>
              <div className="small muted mono">{direct.flights.map((f) => f.flightNo).join(' · ')}</div>
            </>
          ) : (
            <div className="small muted">{data.directError ?? 'No fare found'}</div>
          )}
        </div>
        {direct && <div className="price">{money(direct.price.amount, direct.price.currency)}</div>}
      </div>

      <h2 className="title">
        {options.length === 0
          ? `No tickets found that stop at ${destination}`
          : `${cheaper} of ${options.length} tickets through ${destination} cost less`}
      </h2>

      <ul className="list">
        {options.map((o, i) => (
          <li key={`${o.ticketTo}-${i}`} className="option">
            <div className="option-head">
              <span className="price">{money(o.price.amount, o.price.currency)}</span>
              {o.savingsVsDirect !== null &&
                (o.savingsVsDirect > 0 ? (
                  <span className="save">Save {money(o.savingsVsDirect, o.price.currency)}</span>
                ) : (
                  <span className="muted small">{money(-o.savingsVsDirect, o.price.currency)} more</span>
                ))}
            </div>
            <div className="small muted">
              Ticket to {o.ticketTo} {placeName(o.ticketTo) && `· ${placeName(o.ticketTo)}`}
              {o.hasMixedCarriers && ' · mixed airlines'}
            </div>
            <ul className="legs">
              {o.flightsToTake.map((s, j) => (
                <SegmentRow key={`t${j}`} tag="Fly" s={s} date={date} />
              ))}
              {o.flightsToSkip.map((s, j) => (
                <SegmentRow key={`s${j}`} tag="Skip" s={s} date={date} />
              ))}
            </ul>
          </li>
        ))}
      </ul>

      <details className="checked">
        <summary>
          Checked {checked.length} destinations · {meta.fareApiCalls} live lookups, {meta.fareCacheHits} cached
        </summary>
        <ul className="list compact">
          {checked.map((c) => (
            <li key={c.ticketTo} className="check-row">
              <span className="mono">{c.ticketTo}</span>
              <span className="muted">{placeName(c.ticketTo)}</span>
              <span className="small">
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
    </section>
  )
}

export function PreviewResults({ data, placeName }: Props<CandidatesResponse>) {
  const { shortlist, notShortlisted, origin, destination } = data
  const total = shortlist.length + notShortlisted.length

  return (
    <section className="results">
      <h2 className="title">
        {total === 0
          ? `No scheduled routes continue past ${destination} that day`
          : `${shortlist.length} of ${total} destinations past ${destination} would be checked`}
      </h2>
      <ul className="list">
        {shortlist.map((c) => (
          <li key={c.destination} className="option">
            <div className="option-head">
              <span>
                <span className="mono strong">{c.destination}</span> <span className="muted">{placeName(c.destination)}</span>
              </span>
              <span className="small muted">
                {c.estimate ? `~${money(c.estimate.price, c.estimate.currency)}` : `+${c.bestPath.minutesBeyond} min flying`}
              </span>
            </div>
            <ul className="legs">
              {c.bestPath.hiddenAt < 0 && (
                <li className="leg">
                  <span className="tag">Fly</span>
                  <span className="mono muted">any</span>
                  <span className="route">
                    {origin} → {destination}
                  </span>
                </li>
              )}
              {c.bestPath.legs.map((l, j) => (
                <li key={j} className={`leg ${j > c.bestPath.hiddenAt ? 'skip' : ''}`}>
                  <span className="tag">{j > c.bestPath.hiddenAt ? 'Skip' : 'Fly'}</span>
                  <span className="mono">{l.flightNo}</span>
                  <span className="route">
                    {l.from} {l.departs} → {l.to} {l.arrives}
                  </span>
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
      {notShortlisted.length > 0 && (
        <p className="small muted also">
          Also reachable: <span className="mono">{notShortlisted.map((c) => c.destination).join(' ')}</span>
        </p>
      )}
    </section>
  )
}
