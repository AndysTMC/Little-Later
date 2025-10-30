import { Router } from 'express';

import asyncHandler from '../utils/asyncHandler';
import { switchToChromeEP, switchToLittleLocalEP } from '../controllers/switch';
import { upload } from '../middlewares/upload';

const router: Router = Router();

router.post('/toLittleLocal', upload.any(), asyncHandler(switchToLittleLocalEP));
router.post('/toChrome', asyncHandler(switchToChromeEP));

export default router;
