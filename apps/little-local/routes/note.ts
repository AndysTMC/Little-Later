import { Router } from 'express';
import {
    createNoteEP,
    deleteNoteEP,
    getNoteEP,
    getNotesEP,
    updateNoteEP,
} from '../controllers/note';
import asyncHandler from '../utils/asyncHandler';

const router: Router = Router();

router.post('/', asyncHandler(createNoteEP));
router.patch('/:id', asyncHandler(updateNoteEP));
router.get('/:id', asyncHandler(getNoteEP));
router.get('/', asyncHandler(getNotesEP));
router.delete('/:id', asyncHandler(deleteNoteEP));

export default router;
