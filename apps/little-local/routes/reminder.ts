import { Router } from 'express';
import {
    createReminderEP,
    deleteReminderEP,
    getReminderEP,
    getRemindersEP,
    putReminderEP,
    updateReminderEP,
} from '../controllers/reminder';
import asyncHandler from '../utils/asyncHandler';

const router: Router = Router();

router.post('/', asyncHandler(createReminderEP));
router.post('/main', asyncHandler(putReminderEP));
router.patch('/:id', asyncHandler(updateReminderEP));
router.get('/:id', asyncHandler(getReminderEP));
router.get('/', asyncHandler(getRemindersEP));
router.delete('/:id', asyncHandler(deleteReminderEP));

export default router;
