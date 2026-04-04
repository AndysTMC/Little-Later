import { Router } from 'express';
import asyncHandler from '../utils/asyncHandler';
import { createLinkEP, deleteLinkEP, getLinksEP } from '../controllers/link';

const router: Router = Router();

router.post('/', asyncHandler(createLinkEP));
router.delete('/', asyncHandler(deleteLinkEP));
router.get('/', asyncHandler(getLinksEP));

export default router;
