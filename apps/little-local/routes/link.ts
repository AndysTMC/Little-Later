import { Router } from 'express';
import {} from '../controllers/note';
import asyncHandler from '../utils/asyncHandler';
import { getLinks } from '../services/link';
import { getLinksEP } from '../controllers/link';

const router: Router = Router();

router.get('/', asyncHandler(getLinksEP));

export default router;
