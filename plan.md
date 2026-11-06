# Flight Route Discovery --- Development Handover

**Status:** Initial architecture agreed; implementation planned for
approximately one week.\
**Scope:** Implement the current design described below. Defer further
optimizations until the first version is working and reviewed.

## 1. Project objective

Build a flight-route discovery system that can identify cheaper
itineraries where the ticket's final destination is beyond the airport
the traveller actually wants to reach.

Example:

-   Traveller wants to go from Delhi (DEL) to Kolkata (CCU).
-   A ticket from Delhi to Gaya (GAY) may route through Kolkata.
-   If the traveller can find a suitable itinerary whose scheduled path
    includes Kolkata, the system can surface it as a possible
    hidden-city opportunity.

For this development phase, focus on the route-discovery algorithm and
data architecture. Legal, airline-policy, and travel-risk considerations
are outside the scope of this technical handover.

The system should minimize calls to the flight API. The API has a
limited call allowance, so it should primarily be used for checking
current fares rather than repeatedly discovering the same flight paths.

## 2. High-level architecture

Use two distinct layers:

1.  **Schedule/route data:** A locally stored, centrally maintained
    representation of scheduled flights and their operating patterns.
2.  **Fare data:** Dynamic price information fetched separately when the
    user asks for accurate pricing.

The schedule graph is shared across all users. It should not be rebuilt
for an individual user's search.

### Data flow

1.  A scheduled cron job fetches or refreshes flight schedule
    information.
2.  The application reconciles the fetched schedule data with the local
    database.
3.  The application builds or updates a directed flight graph from the
    stored schedule data.
4.  A user submits an origin, intended destination, and travel date.
5.  The route-search logic traverses the shared graph to discover
    candidate itineraries.
6.  Candidate routes are ranked or filtered using available schedule
    information and, where available, rough fare estimates.
7.  The application makes a limited number of live fare API calls for
    promising candidates.
8.  The user sees the verified fare results.

## 3. Flight graph

### Graph model

Use a **directed adjacency list**.

-   Each airport is a vertex.
-   Each scheduled flight segment is a directed edge from its departure
    airport to its arrival airport.
-   The graph is centralized and covers the airports in the supported
    network.
-   Store outgoing flights for each airport so traversal can efficiently
    inspect only flights departing from the current airport.

Conceptual example:

``` text
DEL
 ├── CCU (flight A)
 ├── BOM (flight B)
 └── LKO (flight C)

CCU
 ├── GAY (flight D)
 └── BLR (flight E)
```

The graph must store flight records as edges, not just destination
airport IDs. Multiple flights can connect the same pair of airports and
must remain separate edges.

### Why adjacency lists

The flight graph is expected to be sparse: each airport connects to a
relatively small subset of all airports.

An adjacency list is therefore a better fit than an adjacency matrix:

-   Adjacency list space: approximately `O(V + E)`.
-   Adjacency matrix space: `O(V²)`.
-   Traversal through an adjacency list visits actual outgoing
    connections instead of scanning every airport.

A matrix's constant-time edge-existence lookup is not a meaningful
advantage for the primary operation, which is exploring actual outgoing
flights.

### Edge data

Each edge should contain enough information to distinguish and evaluate
a scheduled flight, including:

-   Stable flight/service identifier.
-   Flight number.
-   Airline.
-   Departure airport.
-   Arrival airport.
-   Scheduled departure and arrival times.
-   Operating days or weekly operating pattern.
-   Schedule validity/effective dates.
-   Active/inactive status.
-   Any other schedule identifiers supplied reliably by the source API.

Do not assume that flight number alone is a globally unique identifier
for an individual dated flight instance. A flight number can operate
repeatedly on different dates, and codeshares or schedule changes may
require additional identifiers.

### Flight segments versus connecting itineraries

Keep these concepts distinct:

-   A flight service may have an intermediate stop while retaining the
    same flight number.
-   A connecting itinerary may involve two or more separate flight
    services, potentially with different flight numbers.

The data model and route logic must not treat these as automatically
equivalent. The exact representation should follow what the schedule API
provides.

### Time feasibility

Graph connectivity alone does not prove that an itinerary is flyable.

For separate flight services, a candidate connection must respect:

-   Arrival time of the inbound flight.
-   Departure time of the onward flight.
-   Minimum connection time and any relevant airport/terminal
    constraints.
-   Operating date and local time-zone effects.

For example, if the first flight arrives at CCU at 10:00 and the next
departs at 09:30, the graph may contain both edges, but the itinerary is
not feasible.

Do not treat two flights as a valid connection merely because one
arrives at the airport from which the other departs.

## 4. Route-search scope for the first version

The initial search should be bounded rather than exploring arbitrarily
long itineraries.

-   Prioritize direct paths and paths with one intermediate airport (two
    flight legs).
-   Consider deeper paths only where needed, with a configurable upper
    bound of approximately four to five legs.
-   Avoid unrestricted graph traversal, which can generate excessive
    combinations.
-   Apply schedule and time-feasibility checks while constructing
    candidate itineraries.

The graph remains global and reusable. A user's origin and intended
destination determine the part of the graph explored for that search.

## 5. Schedule refresh and database reconciliation

A weekly cron job is the initial schedule-refresh strategy.

The cron should refresh the schedule dataset and reconcile it with the
existing database. It should not blindly append every fetched record or
assume every previously stored record remains valid.

At a high level, reconciliation should identify:

-   New schedule records.
-   Existing records that are unchanged.
-   Existing records whose schedule or operating pattern has changed.
-   Records that are no longer present in a complete, successful source
    snapshot.

Use stable identifiers and set-based comparison/reconciliation rather
than graph traversal to determine which records changed.

**Important:** Do not mark records inactive simply because they are
missing from an incomplete or failed API response. Only treat absence as
meaningful when the source fetch is known to be complete for the
relevant scope.

When a schedule changes, update the stored record and ensure the graph
reflects the new state. A removed or discontinued service should no
longer be considered an active edge.

The initial refresh cadence is weekly. More sophisticated incremental
refresh strategies can be considered after the first implementation.

## 6. Candidate generation and fare verification

The intended approach is a two-stage pipeline.

### Stage A --- Generate candidate routes

Use locally stored schedule information to discover possible paths. This
avoids spending fare API calls on route discovery.

Where rough fare estimates are available, use them to narrow the
candidate set.

The proposed initial filtering approach is:

-   Identify the best rough fare estimate.
-   Keep promising candidates within a configurable margin (an initial
    idea was 20% above the best estimate).
-   Limit the number of candidates sent for live verification (an
    initial idea was the top five).

These values are starting parameters, not permanent business rules. They
should be configurable and validated against actual results.

### Stage B --- Verify fares

When the user requests accurate pricing, call the fare API for the
shortlisted candidates.

The fare API should be used for current price verification, not as the
primary source for repeatedly discovering the route network.

A rough estimate must be clearly distinguished from a verified live
fare.

## 7. Caching strategy

Caching is part of the initial implementation.

Use separate caches for route/schedule-derived results and dynamic fare
results. They have different data freshness requirements.

### Route cache

A route-cache key should be based on:

``` text
origin -> destination -> day-of-week
```

The day-of-week pattern is useful because many flight schedules repeat
weekly. It avoids treating every calendar date as a completely unrelated
route-discovery request.

However, a weekday-only key is not sufficient by itself if schedules
have effective dates or seasonal changes. The cached result must only be
used when the underlying schedule pattern is valid for the requested
travel date.

The route cache stores candidate route combinations or other reusable
route-discovery results. It does not store live fare truth.

### Fare cache

Fare results are date-specific and dynamic. A fare-cache key should
include at least:

``` text
origin -> destination -> actual travel date
```

Add other fare-affecting inputs when relevant, such as passenger count,
cabin class, currency, and fare type. Do not reuse a fare result when
those inputs differ.

### Cache expiration

Use TTL-based expiration. The planned policy is to reduce cache lifetime
as the travel date approaches:

-   Far-future travel dates can use a longer TTL.
-   Near-term travel dates should use a shorter TTL because fares,
    availability, and potentially schedules are more likely to change.
-   Fare-cache TTL should generally be shorter and more aggressive than
    route-cache TTL.

The exact TTL bands and durations can be configured and tuned during
implementation.

### Cron interaction and invalidation

The current proposal is to flush the relevant cache when the scheduled
cron refreshes the graph. Cache entries should also expire automatically
through their TTL.

Avoid unnecessary full-cache flushes when only a small part of the
schedule has changed. For the first version, a straightforward
invalidation policy is acceptable, but keep the cache implementation
separable so more targeted invalidation can be added later.

A future optimization to investigate is identifying which cached route
results depend on a changed flight edge, then invalidating only those
entries. This dependency-tracking problem is intentionally deferred for
now.

## 8. Weighted ranking and route attributes

A weighted graph was discussed as a possible way to rank routes by
price, duration, and other factors.

For the initial version, keep the underlying attributes separate rather
than collapsing everything into one weight too early:

-   Fare/estimated fare.
-   Total journey duration.
-   Number of legs or stops.
-   Departure and arrival times.
-   Connection/wait time.
-   Other relevant route attributes.

Hard feasibility constraints (for example, impossible connection times)
must be checked separately. A low numerical weight must never make an
invalid itinerary acceptable.

A ranking formula can be introduced or refined once the required product
behavior and data quality are clearer.

## 9. Initial implementation boundaries

Implement the following in this development phase:

1.  A persistent schedule dataset for supported flight services.
2.  A weekly schedule-refresh cron.
3.  Safe reconciliation of new, changed, unchanged, and discontinued
    schedule records.
4.  A centralized directed adjacency-list graph built from the schedule
    dataset.
5.  Bounded route traversal for direct and connecting candidates, with a
    configurable depth/leg limit.
6.  Schedule-day and time-feasibility checks for candidate itineraries.
7.  Candidate filtering before live fare verification.
8.  Separate route and fare caches.
9.  Cache keys that reflect route weekday patterns versus actual travel
    dates.
10. TTL-based expiration, with shorter TTLs as departure approaches.
11. A simple cron-triggered cache invalidation strategy.

## 10. Explicitly deferred optimizations

Do not expand the first implementation into a large optimization
project. Revisit these after the initial version is implemented and
tested:

-   Targeted cache invalidation based on changed flight-edge
    dependencies.
-   More advanced incremental graph updates.
-   Precomputed route combinations or materialized route indexes.
-   More advanced ranking/weighting models.
-   Adaptive cache policies based on observed volatility and traffic.
-   Additional optimization for repeated identical searches across many
    users.
-   More sophisticated schedule-refresh frequencies closer to departure.

## 11. Questions to revisit after the first implementation

These are deliberately left open for the next design pass:

1.  How should the system invalidate only route-cache entries affected
    by a changed or removed flight edge?
2.  Should route-cache entries include a schedule version or graph
    version to prevent stale results after a refresh?
3.  What are the appropriate TTL bands for route data, fares, and
    availability at different lead times?
4.  How should schedule effective dates, seasonal schedules,
    cancellations, and last-minute changes be represented?
5.  What candidate limit and rough-fare threshold produce a good balance
    between result quality and API usage?
6.  What is the best ranking function once real route and fare data are
    available?

## 12. Working agreement

The immediate goal is to implement the architecture and caching approach
in this handover over approximately one week of development.

After implementation, bring this document and the current
implementation/results back for review. Continue with the deferred
optimizations only after the first version is working.

**Do not prematurely optimize the system during this first development
pass.**
