import multer from 'multer';
import { RequestHandler } from 'express';

const storage = multer.memoryStorage();

export const upload = multer({
    storage,
    limits: {
        fileSize: 1024 * 1024 * 1024,
        files: 100,
        fields: 100,
    },
    fileFilter: (req, file, cb) => {
        const allowedImageTypes = ['image/png', 'image/jpeg', 'image/webp'];
        const allowedBinaryTypes = ['application/octet-stream', 'application/x-binary'];
        const ok =
            allowedImageTypes.includes(file.mimetype) ||
            allowedBinaryTypes.includes(file.mimetype) ||
            !file.mimetype;
        if (!ok) return cb(new multer.MulterError('LIMIT_UNEXPECTED_FILE'));
        cb(null, true);
    },
});

export const parseAny: RequestHandler = upload.any();
export const parseFieldsOnly: RequestHandler = upload.none();
export const single = (name: string): RequestHandler => upload.single(name);
export const fields = (defs: multer.Field[]): RequestHandler => upload.fields(defs);

export function multerErrorHandler(err: any, req: any, res: any, next: any) {
    if (err instanceof multer.MulterError) {
        return res.status(400).json({
            error: 'UPLOAD_ERROR',
            code: err.code,
            message: err.message,
        });
    }
    next(err);
}

export function getFile(req: any, field: string) {
    const files = (req.files as Express.Multer.File[]) || [];
    return files.find((f) => f.fieldname === field);
}
