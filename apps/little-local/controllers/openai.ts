import { Request, Response } from 'express';
import { getUserSettings } from '../services/settings';
import { LAI_PROVIDERS } from 'little-shared/enums';
import OpenAI from 'openai';

export const baseUrls = new Map<string, string>([
    [LAI_PROVIDERS.GROQ, 'https://api.groq.com/openai/v1'],
]);

export const createV1ChatCompletions = async (req: Request, res: Response) => {
    const userSettings = getUserSettings();
    if (!userSettings.ai) {
        return res.status(403).send('AI features are disabled in user settings.');
    }
    const api = new OpenAI({
        apiKey: userSettings.ai.assist.apiKey,
        baseURL: baseUrls.get(userSettings.ai.assist.apiKey) || 'https://api.openai.com/v1',
    });
    const body = req.body as OpenAI.Chat.Completions.ChatCompletionCreateParams;
    const response = await api.chat.completions.create(body);
    res.status(200).json(response);
};
