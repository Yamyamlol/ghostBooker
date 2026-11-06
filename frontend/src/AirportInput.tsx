import { useMemo, useState } from 'react'
import type { KeyboardEvent } from 'react'
import type { Airport } from './api'

type Props = {
  id: string
  label: string
  value: string
  airports: Airport[]
  onChange: (iata: string) => void
}

// Airport picker: focusing shows every airport; typing filters by code, city or airport name
export function AirportInput({ id, label, value, airports, onChange }: Props) {
  const [query, setQuery] = useState<string | null>(null) // null while not editing
  const [active, setActive] = useState(0)
  const editing = query !== null

  const matches = useMemo(() => {
    const q = (query ?? '').trim().toLowerCase()
    if (!q) return airports
    const byCode = airports.filter((a) => a.iata.toLowerCase().startsWith(q))
    const byPlace = airports.filter(
      (a) => !byCode.includes(a) && `${a.city ?? ''} ${a.name}`.toLowerCase().includes(q),
    )
    return [...byCode, ...byPlace]
  }, [airports, query])

  const choose = (iata: string) => {
    onChange(iata)
    setQuery(null)
  }

  // Leaving the field keeps an exact code or the only match; anything else reverts
  const commit = () => {
    const typed = (query ?? '').trim().toUpperCase()
    if (airports.some((a) => a.iata === typed) || (!airports.length && /^[A-Z]{3}$/.test(typed))) choose(typed)
    else if (typed && matches.length === 1) choose(matches[0].iata)
    else setQuery(null)
  }

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (!editing) return
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      const next = Math.max(0, Math.min(matches.length - 1, active + (e.key === 'ArrowDown' ? 1 : -1)))
      setActive(next)
      document.getElementById(`${id}-opt-${next}`)?.scrollIntoView({ block: 'nearest' })
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (matches[active]) choose(matches[active].iata)
      else commit()
    } else if (e.key === 'Escape') {
      setQuery(null)
      e.currentTarget.blur()
    }
  }

  const place = airports.find((a) => a.iata === value)

  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        className="code"
        role="combobox"
        aria-expanded={editing}
        aria-controls={`${id}-list`}
        aria-autocomplete="list"
        aria-activedescendant={editing && matches[active] ? `${id}-opt-${active}` : undefined}
        value={editing ? query : value}
        placeholder={value}
        onFocus={() => {
          setQuery('')
          setActive(0)
        }}
        onChange={(e) => {
          setQuery(e.target.value)
          setActive(0)
        }}
        onBlur={commit}
        onKeyDown={onKeyDown}
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
      />
      <span className="hint">{place ? (place.city ?? place.name) : ''}</span>

      {editing && (
        <ul id={`${id}-list`} role="listbox" className="combo-list">
          {matches.length === 0 && <li className="combo-empty">No airport matches “{query}”</li>}
          {matches.map((a, i) => (
            <li
              key={a.iata}
              id={`${id}-opt-${i}`}
              role="option"
              aria-selected={i === active}
              className="combo-option"
              // mousedown (not click) so the choice lands before the input loses focus
              onMouseDown={(e) => {
                e.preventDefault()
                choose(a.iata)
              }}
              onMouseEnter={() => setActive(i)}
            >
              <span className="mono strong">{a.iata}</span>
              <span>{a.city ?? a.name}</span>
              <span className="muted combo-name">{a.name}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
