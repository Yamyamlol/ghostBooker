import { Router } from 'express';
import { importStatic, refresh, status } from '../controllers/scheduleController.js';

const router = Router();

router.post('/import-static', importStatic);
router.post('/refresh', refresh);
router.get('/status', status);

export default router;
