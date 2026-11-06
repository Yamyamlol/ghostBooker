import { importAirports, listServedAirports } from '../services/airports.js';

export const importAirportList = async (req, res) => {
  res.status(200).json({ success: true, ...(await importAirports()) });
};

export const getAirports = async (req, res) => {
  res.status(200).json({ success: true, airports: await listServedAirports() });
};
