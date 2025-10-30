import path from 'path';
import express, { NextFunction, Request, Response } from 'express';
import http from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import config from './config.js';
import { initializeDatabase } from './db.js';
import { DB_CHANGE_KEYS } from './enums.js';
import { appEmitter } from './emitter.js';
import dataExchangeRoutes from './routes/dataExchange.js';
import switchRoutes from './routes/switch.js';
import linkRoutes from './routes/link.js';
import noteRoutes from './routes/note.js';
import reminderRoutes from './routes/reminder.js';
import settingsRoutes from './routes/settings.js';
import taskRoutes from './routes/task.js';
import userRoutes from './routes/user.js';
import visualBMRoutes from './routes/visualBM.js';
import openaiRoutes from './routes/openai.js';
import { multerErrorHandler, parseAny } from './middlewares/upload.js';

export default () => {
    const app = express();
    const server = http.createServer(app);
    initializeDatabase();
    const io: Server = new Server(server, {
        cors: {
            origin: (origin, callback) => {
                console.log('CORS origin:', origin);
                if ((origin && origin.startsWith('chrome-extension://')) || true) {
                    callback(null, true);
                } else {
                    callback(new Error('Not allowed by CORS'));
                }
            },
        },
    });
    for (const dbChangeKey of Object.values(DB_CHANGE_KEYS)) {
        appEmitter.on(dbChangeKey, (...args) => {
            io.emit(dbChangeKey);
        });
    }
    app.use(
        cors({
            origin: (origin, callback) => {
                console.log('CORS origin:', origin);
                if ((origin && origin.startsWith('chrome-extension://')) || true) {
                    callback(null, true);
                } else {
                    callback(new Error('Not allowed by CORS'));
                }
            },
        })
    );
    app.use((err: any, req: Request, res: Response, next: NextFunction) => {
        if (err.message === 'Not allowed by CORS') {
            res.status(403).send('CORS error: ' + err.message);
        } else {
            next(err);
        }
    });
    app.use('/api/switch', switchRoutes);
    app.use(express.json({ limit: '1gb' }));
    app.use(express.urlencoded({ extended: true, limit: '1gb' }));
    app.use(express.static(path.join(__dirname, 'public')));
    app.use('/api/dataExchange', dataExchangeRoutes);
    app.use('/api/link', linkRoutes);
    app.use('/api/note', noteRoutes);
    app.use('/api/reminder', reminderRoutes);
    app.use('/api/settings', settingsRoutes);
    app.use('/api/task', taskRoutes);
    app.use('/api/user', userRoutes);
    app.use('/api/visualBM', visualBMRoutes);
    app.use('/api/openai', openaiRoutes);
    app.get('/api/emitter-test', (req, res) => {
        res.send('Hello from emitter-test!');
        appEmitter.emit(DB_CHANGE_KEYS.userSettingsChange);
    });
    app.use(multerErrorHandler);
    io.on('connection', (socket) => {
        console.log('New WebSocket connection:', socket.id);
        socket.on('disconnect', () => {});
    });
    server.listen(config.port, () =>
        console.log(`server.js app listening on port ${config.port}!`)
    );
    return io;
};
