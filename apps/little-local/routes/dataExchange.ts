import { raw, Router } from 'express';
import {
    exportDataImportableEP,
    exportDataReadableEP,
    importDataEP,
} from '../controllers/dataExchange';
import asyncHandler from '../utils/asyncHandler';

const router: Router = Router();

router.post('/importData', raw({ type: 'application/octet-stream', limit: '2gb' }), importDataEP);
router.get('/exportDataReadable', asyncHandler(exportDataReadableEP));
router.get('/exportDataImportable', asyncHandler(exportDataImportableEP));

export default router;
