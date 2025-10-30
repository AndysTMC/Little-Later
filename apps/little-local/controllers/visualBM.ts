import { Request, Response } from 'express';
import {
    getVisualBM,
    getVisualBMByUrl,
    getVisualBMPreview,
    getVisualBMs,
    putVisualBM,
    updateVisualBM,
    updateVisualBMPreview,
} from '../services/visualBM';
import { LNote, LVisualBM, LVisualBMInsert } from 'little-shared/types';
import { appEmitter } from '../emitter';
import { DB_CHANGE_KEYS } from '../enums';

export const putVisualBMEP = async (req: Request, res: Response) => {
    const {
        visualBMInsert,
        noteCreates,
        noteUpdates,
        noteDeletes,
        reminderDeleteIds,
        taskDeleteIds,
    } = req.body as {
        visualBMInsert: LVisualBMInsert;
        noteCreates: LNote[];
        noteUpdates: LNote[];
        noteDeletes: LNote[];
        reminderDeleteIds: Array<number>;
        taskDeleteIds: Array<number>;
    };
    if (!visualBMInsert) {
        res.status(400).send('Visual Bookmark data is required');
        return;
    }
    const id = putVisualBM(
        visualBMInsert,
        noteCreates,
        noteUpdates,
        noteDeletes,
        reminderDeleteIds,
        taskDeleteIds
    );
    res.status(200).send(id);
    appEmitter.emit(DB_CHANGE_KEYS.visualBMsChange);
};

export const updateVisualBMEP = async (req: Request, res: Response) => {
    const { url } = req.query as { url: string };
    const { modifications } = req.body as {
        modifications: Partial<LVisualBM>;
    };
    if (!url || !modifications) {
        res.status(400).send('ID and modifications are required');
        return;
    }
    const vbmId = updateVisualBM(url, modifications);
    res.status(200).send(vbmId);
    appEmitter.emit(DB_CHANGE_KEYS.visualBMsChange);
};

export const updateVisualBMPreviewEP = async (req: Request, res: Response) => {
    const { vbmUrl } = req.query as { vbmUrl: string };
    const preview = req.body as Buffer;
    if (!vbmUrl || !preview) {
        res.status(400).send('ID and preview data are required');
        return;
    }
    updateVisualBMPreview(vbmUrl, preview);
    res.sendStatus(204);
    appEmitter.emit(DB_CHANGE_KEYS.vbmPreviewsChange);
};

export const getVisualBMPreviewEP = async (req: Request, res: Response) => {
    const { vbmId } = req.params;
    if (!vbmId) {
        res.status(400).send('ID is required');
        return;
    }
    const preview = getVisualBMPreview(parseInt(vbmId, 10)) as Buffer | undefined;
    if (preview) {
        res.setHeader('Content-Type', 'image/jpeg');
        res.status(200).send(preview);
    } else {
        res.status(404).send('VisualBM preview not found');
    }
};

export const getVisualBMEP = async (req: Request, res: Response) => {
    const { id } = req.params;
    if (!id) {
        return res.status(400).send('ID is required');
    }
    const visualBM = getVisualBM(parseInt(id, 10));
    if (visualBM) {
        res.status(200).json(visualBM);
    } else {
        res.status(404).send('Visual bookmark not found');
    }
};

export const getVisualBMByUrlEP = async (req: Request, res: Response) => {
    const { url } = req.query as { url: string };
    console.log('Url: ', url);
    if (!url) {
        res.status(400).send('URL is required');
        return;
    }
    const visualBM = getVisualBMByUrl(url);
    if (visualBM) {
        res.status(200).json(visualBM);
    } else {
        res.status(404).send('Visual bookmark not found');
    }
};

export const getVisualBMsEP = async (req: Request, res: Response) => {
    const visualBMs = getVisualBMs();
    res.status(200).json(visualBMs);
};
