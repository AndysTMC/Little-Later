import { Request, Response } from 'express';
import { getLinks } from '../services/link';

export const getLinksEP = async (req: Request, res: Response) => {
    try {
        const notes = getLinks();
        res.status(200).json(notes);
    } catch (error) {
        console.error('Error retrieving links:', error);
        res.status(500).send('An error occurred while retrieving links');
    }
};
