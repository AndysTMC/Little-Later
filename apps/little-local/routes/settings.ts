import { Router } from 'express';
import { getUserSettingsEP, updateUserSettingsEP } from '../controllers/settings';
import asyncHandler from '../utils/asyncHandler';

const router: Router = Router();

router.post('/', asyncHandler(updateUserSettingsEP));
router.get('/', asyncHandler(getUserSettingsEP));

export default router;
