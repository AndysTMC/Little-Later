import { Router, raw } from 'express';
import {
    authenticateUserEP,
    createUserEP,
    deleteUserEP,
    getCurrentUserProfileEP,
    getUserAvatarEP,
    getUserProfilesEP,
    lockUserEP,
    unlockUserEP,
    updateUserAvatarEP,
    updateUserProfileEP,
} from '../controllers/user';
import asyncHandler from '../utils/asyncHandler';

const router: Router = Router();

router.post('/', asyncHandler(createUserEP));
router.post('/auth', asyncHandler(authenticateUserEP));
router.post('/unlock', asyncHandler(unlockUserEP));
router.post('/lock', asyncHandler(lockUserEP));
router.patch('/:userId', asyncHandler(updateUserProfileEP));
router.patch(
    '/avatar/:userId',
    raw({ type: ['image/png', 'image/jpeg', 'image/webp'], limit: '5mb' }),
    asyncHandler(updateUserAvatarEP)
);
router.get('/avatar/:userId', asyncHandler(getUserAvatarEP));
router.get('/current', asyncHandler(getCurrentUserProfileEP));
router.get('/', asyncHandler(getUserProfilesEP));
router.delete('/:userId', asyncHandler(deleteUserEP));

export default router;
