import config from '../config.js';
import { getCandidates } from '../services/routeSearch.js';
import { searchHiddenCity } from '../services/hiddenCity.js';
import { httpError, today } from '../utils/schedule.js';

const MAX_CANDIDATE_LIMIT = 20;

const parseSearch = (input = {}) => {
  const origin = String(input.origin ?? '').toUpperCase();
  const destination = String(input.destination ?? '').toUpperCase();
  const date = String(input.date ?? input.departure_date ?? '');
  if (!/^[A-Z]{3}$/.test(origin) || !/^[A-Z]{3}$/.test(destination)) {
    throw httpError(400, 'origin and destination must be 3-letter IATA codes');
  }
  if (origin === destination) throw httpError(400, 'origin and destination must differ');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(date))) throw httpError(400, 'date must be YYYY-MM-DD');
  if (date < today()) throw httpError(400, 'date is in the past');

  // How many ticket destinations to verify with live fares (each costs one fare API call)
  const limit = input.limit === undefined ? config.search.candidateLimit : Number(input.limit);
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_CANDIDATE_LIMIT) {
    throw httpError(400, `limit must be an integer from 1 to ${MAX_CANDIDATE_LIMIT}`);
  }
  return { origin, destination, date, limit };
};

// Stage A only: candidate routes from the local schedule, no fare API calls
export const getRouteCandidates = async (req, res) => {
  const { origin, destination, date, limit } = parseSearch(req.query);
  res.status(200).json({ success: true, ...(await getCandidates(origin, destination, date, limit)) });
};

// Full search: candidates plus live fare verification
export const getFlights = async (req, res) => {
  const { origin, destination, date, limit } = parseSearch(req.body);
  res.status(200).json({ success: true, ...(await searchHiddenCity(origin, destination, date, limit)) });
};
