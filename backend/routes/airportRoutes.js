import { Router } from 'express';
import { getAirports, importAirportList } from '../controllers/airportController.js';

const router = Router();

router.get('/', getAirports);
router.post('/import', importAirportList);

export default router;
