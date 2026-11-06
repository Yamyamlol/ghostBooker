# ghostBooker

A fun personal project, strictly for **"educational purposes"** 😉

It finds "hidden-city" flight tickets in India: tickets to somewhere further away that happen to stop at the city you
actually want to reach, and sometimes cost less than flying there directly. You get off at your city and, well, the
plane goes on without you.

It started with a LinkedIn post claiming a Delhi → Gaya ticket via Kolkata can be cheaper than Delhi → Kolkata. As
someone who lives in Kolkata, I had to find out.

<p>
  <img src="docs/screenshots/desktop.png" alt="ghostBooker on desktop: a Delhi to Kolkata search finds a ticket to Gaya via Kolkata for ₹7,049 against a ₹9,669 regular fare" width="72%" />
  &nbsp;
  <img src="docs/screenshots/phone.png" alt="ghostBooker on a phone showing the same search" width="24%" />
</p>

It turned out to be true. Delhi → Kolkata on 7 Dec 2026: the regular fare was ₹9,669, while a ticket to Gaya that
stops in Kolkata cost ₹7,049 (₹2,620 less).

> **This is a hobby project for learning and fun, not a product.** It isn't meant for commercial use or for making
> money, it isn't affiliated with any airline or fare provider, and nothing here is travel or legal advice. Please
> read the [disclaimers](#disclaimers) before getting any ideas.

## How it works

1. **Schedule graph.** Every domestic flight goes into a directed graph: airports are nodes, scheduled flights are
   edges with times, weekdays and validity dates.
2. **Route search.** From your origin, it walks through your destination to every city one flight beyond it, keeping
   only connections you could actually make (same airline, 1 to 6 hour layover).
3. **Live fares, sparingly.** It ranks those cities and checks live fares for only the top few. Every fare is cached
   in Redis, so repeating a search doesn't spend another API call.
4. **Verification.** Only tickets whose itinerary really lands at your city before the last leg are shown.

## Data

- **Schedules:** a free [Indian domestic flight schedule dataset](https://huggingface.co/datasets/Kabil007/IndianDomesticAirlineDataset)
  on Hugging Face, re-dated to this year's seasons
- **Airports:** [OurAirports](https://ourairports.com/data/)
- **Live fares:** the [Ignav](https://ignav.com) API

## Run it

- `backend/`: Node.js, Express, MySQL and Redis. Setup and endpoints are in [backend/README.md](backend/README.md).
- `frontend/`: React, Vite and Tailwind. See [frontend/README.md](frontend/README.md).

## Limitations

It's an early version: the schedule data is last year's, smaller airports are patchy, and it only covers India. I'll
keep improving it as I go.

## Disclaimers

Hidden-city ticketing is a real thing, but so are its catches:

- **No checked baggage.** Checked bags are tagged to the ticket's final destination, so your suitcase goes to Gaya
  while you stay in Kolkata. Even a cabin bag can get gate-checked on a full flight, and then it's tagged through too.
- **Flights change.** Airlines retime, cancel and reroute flights. Your connection might move to a different city, or
  you could be rebooked onto a direct flight to the final destination. When something goes wrong, the airline's job
  is to get you to the city on your ticket, not the one you secretly wanted.
- **One-way only.** Skipping a flight usually cancels every remaining flight on the booking, including any return.
- **Airlines don't like it.** Most airlines' terms of carriage forbid it. They can cancel tickets, charge you the fare
  difference, or penalise or close your frequent-flyer account. Doing it repeatedly with the same airline is asking
  for trouble.
- **The data can be wrong.** Schedules here are approximate and fares change by the minute. Always check the actual
  itinerary with the airline before booking.
- **No warranty.** This code is provided as is, for learning and personal curiosity. If you use it to book anything,
  you do so entirely at your own risk.
