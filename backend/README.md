# ghostBooker backend

Hidden-city route discovery for Indian domestic flights. A shared schedule graph (MySQL, loaded into memory)
generates candidate tickets locally; live Ignav fares verify only a shortlist.

## Run

Needs MySQL and Redis running (`brew services start mysql redis`) and `backend/.env` with
`MYSQL_*`, `REDIS_URL`, `IGNAV_API_URL`, `IGNAV_API_KEY` and `AIRLABS_API_KEY`.

```sh
npm install
npm run backend   # creates tables on startup, listens on :3000
```

## Endpoints

| Method | Path | Body / query | What it does | External calls |
| --- | --- | --- | --- | --- |
| POST | `/api/airports/import` | – | Loads Indian airports from OurAirports | OurAirports (free) |
| GET | `/api/airports` | – | Airports with active flights, for search autocomplete | none |
| POST | `/api/schedule/import-static` | `{ "force": false }` (optional) | Loads the free Hugging Face schedule (latest 12 months, re-dated to this year's seasons), reconciles, rebuilds the graph | Hugging Face (free) |
| POST | `/api/schedule/refresh` | `{ "airports": ["DEL"], "force": false }` (both optional) | Pulls departures from AirLabs. Free keys can't page past ~100 rows, so this only completes for small airports or on a paid key | AirLabs, ~1 request per 50 routes per airport |
| GET | `/api/schedule/status` | – | Graph size and version, recent imports | none |
| GET | `/api/flights/candidates` | `?origin=DEL&destination=CCU&date=2026-12-07&limit=5` | Stage A only: candidate tickets from the local schedule | none |
| POST | `/api/flights/search` | `{ "origin": "DEL", "destination": "CCU", "date": "2026-12-07", "limit": 5 }` | Candidates plus live fare verification | Ignav, 1 + `limit` (cached) |

First run: `POST /api/airports/import`, then `POST /api/schedule/import-static`, then search. `limit` (1–20, default
`CANDIDATE_LIMIT`) is how many ticket destinations a search verifies with live fares.

Without past fares, destinations rank by least extra flying after your destination; once searches have recorded
fares, the cheapest recent observation ranks first.

## How an import stays safe

- Each source (`static`, `airlabs`) is reconciled separately against its own rows.
- Any failed download or AirLabs request, or a page count short of AirLabs' `total_items`, aborts the import;
  nothing is written.
- An AirLabs refresh can only deactivate flights departing the airports it refreshed.
- If a snapshot is under `MIN_SNAPSHOT_RATIO` (default 50%) of what is active now, it is refused with a 422
  unless you pass `"force": true`.

## Tuning (`.env`, all optional)

| Variable | Default | Meaning |
| --- | --- | --- |
| `SEARCH_MAX_LEGS` | 2 | Legs on the booked ticket, including those past the destination (3+ can hit `SEARCH_MAX_PATHS`) |
| `MIN_CONNECTION_MINUTES` / `MAX_CONNECTION_MINUTES` | 60 / 360 | Connection window between different flights |
| `SAME_AIRLINE_ONLY` | true | Only chain flights of one airline (single-ticket itineraries) |
| `CANDIDATE_LIMIT` | 5 | Ticket destinations verified with live fares per search |
| `ESTIMATE_MARGIN` | 0.2 | Drop destinations whose rough estimate is more than 20% above the best one |
| `MIN_SNAPSHOT_RATIO` | 0.5 | See above |

Cache TTL bands live in `config.js` (`ttl.fare`, `ttl.route`).
