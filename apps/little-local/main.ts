import { app, BrowserWindow, Menu, Tray, ipcMain, nativeImage } from 'electron';
import path, { dirname } from 'node:path';
import AutoLaunch from 'auto-launch';
import { fileURLToPath } from 'node:url';
import net from 'net';
import config from './config.js';
import CreateServer from './server.js';
import { Server } from 'socket.io';

const MIN_PORT = 1024;
const MAX_PORT = 65535;

declare global {
    interface Window {
        electronAPI: {
            setPort: (port: number) => void;
        };
    }
}

let server: Server;
let tray: Tray | undefined;
const iconPath = path.join(__dirname, 'assets', 'icon.ico');

const getTrayContextMenu = () => {
    const contextMenu = Menu.buildFromTemplate([
        {
            label: 'Set Port (C: ' + config.port + ')',
            click: () => {
                const portWindow = new BrowserWindow({
                    icon: iconPath,
                    width: 400,
                    height: 200,
                    title: 'Set Port',
                    webPreferences: {
                        nodeIntegration: true,
                        preload: path.join(__dirname, 'preloads', 'set-port.js'),
                    },
                    resizable: false,
                    autoHideMenuBar: true,
                });
                portWindow.loadFile(path.join(__dirname, 'views', 'set-port.html'));
            },
        },
        { type: 'separator' },
        { label: 'Exit', click: () => app.quit() },
    ]);
    return contextMenu;
};

const setupTray = () => {
    tray = new Tray(iconPath);
    tray.setToolTip('Little Local');
    tray.setContextMenu(getTrayContextMenu());
};

const appAutoLauncher = new AutoLaunch({
    name: 'Little Local',
    path: process.execPath,
});

app.whenReady().then(async () => {
    if (!app.isPackaged) {
        console.log('Skipping autostart in dev mode');
    } else {
        const isEnabled = await appAutoLauncher.isEnabled();
        if (!isEnabled) await appAutoLauncher.enable();
    }
    setupTray();
    server = CreateServer();
});

app.on('window-all-closed', () => {});

function isPortInUse(port: number) {
    return new Promise((resolve) => {
        const server = net.createServer();

        server.once('error', (err: NodeJS.ErrnoException) => {
            if (err.code === 'EADDRINUSE') {
                console.log(`Port ${port} is already in use.`);
                resolve(true);
            } else {
                resolve(false);
            }
        });

        server.once('listening', () => {
            server.close();
            resolve(false);
        });

        server.listen(port, 'localhost');
    });
}

ipcMain.on('set-port', async (_, port) => {
    if (port < MIN_PORT || port > MAX_PORT) {
        console.error('Port number must be between 1024 and 65535.');
        return;
    }
    const isPortNA = await isPortInUse(port);
    if (isPortNA == false) {
        config.port = port;
        await server.close();
        server = CreateServer();
        if (tray) {
            tray.setContextMenu(getTrayContextMenu());
        }
    }
});
