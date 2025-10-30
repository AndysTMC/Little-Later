import { Router } from 'express';
import {
    createTaskEP,
    deleteTaskEP,
    getTaskEP,
    getTasksEP,
    putTaskEP,
    updateTaskEP,
} from '../controllers/task';
import asyncHandler from '../utils/asyncHandler';

const router: Router = Router();

router.post('/', asyncHandler(createTaskEP));
router.post('/main', asyncHandler(putTaskEP));
router.patch('/:id', asyncHandler(updateTaskEP));
router.get('/:id', asyncHandler(getTaskEP));
router.get('/', asyncHandler(getTasksEP));
router.delete('/:id', asyncHandler(deleteTaskEP));

export default router;
