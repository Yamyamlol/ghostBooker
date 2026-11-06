import { importAirports } from '../services/airports.js';

export const importAirportList = async (req, res) => {
  res.status(200).json({ success: true, ...(await importAirports()) });
};
