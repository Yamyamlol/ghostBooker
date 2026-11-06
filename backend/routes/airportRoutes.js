import { Router } from 'express';
import { importAirportList } from '../controllers/airportController.js';

const router = Router();

router.post('/import', importAirportList);

export default router;
