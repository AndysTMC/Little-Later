import { Request, Response } from 'express';
import { exportDataImportable, exportDataReadable, importData } from '../services/dataExchange';
import { Readable } from 'stream';

export const exportDataImportableEP = async (req: Request, res: Response) => {
    const buffer = await exportDataImportable();
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Disposition', 'attachment; filename="Little-Later-Importable.lldat"');
    res.setHeader('Content-Length', buffer.length);
    const readableStream = Readable.from(buffer);
    readableStream.pipe(res);
};

export const exportDataReadableEP = async (req: Request, res: Response) => {
    const buffer = await exportDataReadable();
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', 'attachment; filename="Little-Later-Readable.json"');
    res.setHeader('Content-Length', buffer.length);
    const readableStream = Readable.from(buffer);
    readableStream.pipe(res);
};

export const importDataEP = async (req: Request, res: Response) => {
    const buffer = req.body as ArrayBuffer;
    importData(buffer);
    res.sendStatus(204);
};
