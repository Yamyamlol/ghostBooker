import { Router } from 'express';
import { getFlights, getRouteCandidates } from '../controllers/flightController.js';

const router = Router();

router.get('/candidates', getRouteCandidates);
router.post('/search', getFlights);

export default router;
