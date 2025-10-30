import { Request, Response } from 'express';
import {
    authenticateUser,
    createUser,
    deleteUser,
    getCurrentUserProfile,
    getUserAvatar,
    getUserProfiles,
    lockUser,
    unlockUser,
    updateUserAvatar,
    updateUserProfile,
} from '../services/user';
import { LUserProfile } from 'little-shared/types';
import { getFile } from '../middlewares/upload';
import { appEmitter } from '../emitter';
import { DB_CHANGE_KEYS } from '../enums';

export const createUserEP = async (req: Request, res: Response) => {
    const { name } = req.body as {
        name: string;
    };
    const avatarFile = getFile(req, 'avatar');
    const avatar = avatarFile ? avatarFile.buffer : null;
    if (!name) {
        res.status(400).send('Name is required');
        return;
    }
    const userId = await createUser(name, avatar);
    res.status(201).json(userId);
    appEmitter.emit(DB_CHANGE_KEYS.userProfilesChange);
    appEmitter.emit(DB_CHANGE_KEYS.userAvatarsChange);
};

export const authenticateUserEP = async (req: Request, res: Response) => {
    const { id, password } = req.body as {
        id: number;
        password?: string;
    };
    if (!id) {
        res.status(400).send('User ID is required');
        return;
    }
    const result = await authenticateUser(id, password);
    res.status(200).json(result);
};

export const deleteUserEP = async (req: Request, res: Response) => {
    const { userId } = req.params as { userId: string };
    if (!userId) {
        res.status(400).send('User ID is required');
        return;
    }
    deleteUser(parseInt(userId, 10));
    res.sendStatus(204);
    appEmitter.emit(DB_CHANGE_KEYS.userProfilesChange);
};

export const getCurrentUserProfileEP = async (req: Request, res: Response) => {
    const currentUserProfile = getCurrentUserProfile();
    if (currentUserProfile) {
        res.status(200).json(currentUserProfile);
    } else {
        res.status(204).send();
    }
};

export const unlockUserEP = async (req: Request, res: Response) => {
    const { id, password } = req.body as { id: number; password?: string };
    if (!id) {
        return res.status(400).send('User ID is required');
    }
    await unlockUser(id, password);
    res.sendStatus(204);
};

export const lockUserEP = async (req: Request, res: Response) => {
    const password = req.body?.password as string | undefined;
    await lockUser(password);
    res.sendStatus(204);
};

export const updateUserProfileEP = async (req: Request, res: Response) => {
    const { userId } = req.params as { userId: string };
    const { modifications } = req.body as {
        modifications: Partial<LUserProfile>;
    };
    if (!userId || !modifications) {
        return res.status(400).send('User ID and modifications are required');
    }
    updateUserProfile(parseInt(userId, 10), modifications);
    res.sendStatus(204);
    appEmitter.emit(DB_CHANGE_KEYS.userProfilesChange);
};

export const updateUserAvatarEP = async (req: Request, res: Response) => {
    const { userId } = req.params as { userId: string };
    const buffer = req.body as Buffer;
    if (!buffer) {
        return res.status(400).send('Avatar data is required');
    }
    updateUserAvatar(parseInt(userId, 10), buffer);
    res.sendStatus(204);
    appEmitter.emit(DB_CHANGE_KEYS.userAvatarsChange);
};

export const getUserAvatarEP = async (req: Request, res: Response) => {
    const { userId } = req.params as { userId: string };
    if (!userId) {
        return res.status(400).send('User ID is required');
    }
    const avatar = getUserAvatar(parseInt(userId, 10)) as Buffer | null | undefined;
    const { fileTypeFromBuffer } = await import('file-type');
    if (avatar) {
        const fileType = await fileTypeFromBuffer(avatar);
        if (fileType) {
            res.setHeader('Content-Type', fileType.mime);
            res.status(200).send(avatar);
        } else {
            res.status(400).send('Invalid avatar data');
        }
    } else {
        res.status(404).send('User avatar not found');
    }
};

export const getUserProfilesEP = async (req: Request, res: Response) => {
    const userProfiles = getUserProfiles();
    res.status(200).json(userProfiles);
};
