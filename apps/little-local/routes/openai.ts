import { Router } from 'express';
import { createV1ChatCompletions } from '../controllers/openai';
import asyncHandler from '../utils/asyncHandler';

const router: Router = Router();

router.post('/v1/chat/completions', asyncHandler(createV1ChatCompletions));

export default router;
