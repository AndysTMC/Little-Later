import { raw, Router } from 'express';
import {
    getVisualBMByUrlEP,
    getVisualBMEP,
    getVisualBMPreviewEP,
    getVisualBMsEP,
    putVisualBMEP,
    updateVisualBMEP,
    updateVisualBMPreviewEP,
} from '../controllers/visualBM';
import asyncHandler from '../utils/asyncHandler';

const router: Router = Router();

router.post('/main', asyncHandler(putVisualBMEP));
router.patch('/', asyncHandler(updateVisualBMEP));
router.patch(
    '/preview',
    raw({ type: ['image/jpeg'], limit: '5mb' }),
    asyncHandler(updateVisualBMPreviewEP)
);
router.get('/preview/:vbmId', asyncHandler(getVisualBMPreviewEP));
router.get('/byUrl', asyncHandler(getVisualBMByUrlEP));
router.get('/:id', asyncHandler(getVisualBMEP));
router.get('/', asyncHandler(getVisualBMsEP));

export default router;
