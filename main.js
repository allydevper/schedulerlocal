const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');

// Al empaquetar como "portable" (electron-builder), Windows inyecta
// PORTABLE_EXECUTABLE_DIR = carpeta donde está el .exe que se ejecutó.
// Guardamos ahí los datos (localStorage, config) en vez de en %APPDATA%,
// así cada copia del .exe (en carpetas distintas) tiene su propia memoria,
// independiente de las demás copias.
if (process.env.PORTABLE_EXECUTABLE_DIR) {
    app.setPath('userData', path.join(process.env.PORTABLE_EXECUTABLE_DIR, 'URL Scheduler Data'));
}

const lock = app.requestSingleInstanceLock();
if (!lock) {
    app.quit();
}

let mainWindow = null;

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1600,
        height: 950,
        minWidth: 900,
        minHeight: 650,
        title: 'URL Scheduler',
        icon: path.join(__dirname, 'icon.ico'),
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            backgroundThrottling: false,
            preload: path.join(__dirname, 'preload.js')
        }
    });

    mainWindow.loadFile('index.html');
    mainWindow.setMenuBarVisibility(false);

    mainWindow.on('close', (event) => {
        // Prevent immediate close; let renderer abort first, then quit
        event.preventDefault();
        mainWindow.webContents.send('app-closing');
        // Give renderer 500ms to clean up, then force close
        setTimeout(() => {
            mainWindow.destroy();
        }, 500);
    });
}

app.whenReady().then(createWindow);

app.on('second-instance', () => {
    if (mainWindow) {
        if (mainWindow.isMinimized()) mainWindow.restore();
        mainWindow.focus();
    }
});

app.on('window-all-closed', () => {
    app.quit();
});
