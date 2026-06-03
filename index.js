const { app, BrowserWindow, ipcMain, Tray, Menu } = require('electron');
const path = require('path');
const express = require('express');
const cors = require('cors');
const Store = require('electron-store');

const store = new Store();
let mainWindow;
let tray = null;
const expressApp = express();
const activePrintWindows = new Set();

expressApp.use(cors());
expressApp.use(express.json({ limit: '10mb' }));

// Express API
expressApp.get('/status', (req, res) => {
  res.json({ status: 'running', port: 2321 });
});

expressApp.get('/printers', async (req, res) => {
  if (mainWindow) {
    const printers = await mainWindow.webContents.getPrintersAsync();
    res.json(printers);
  } else {
    res.json([]);
  }
});

async function processPrintJob(html, type, res) {
  const printerType = type === 'kot' ? 'kotPrinter' : 'billPrinter';
  const targetPrinter = store.get(printerType);

  if (!targetPrinter) {
    console.error(`No printer configured for ${type}`);
    return res.status(400).json({ error: `No printer configured for ${type}` });
  }

  console.log(`Processing print job for ${type} on ${targetPrinter}...`);

  try {
    let printWindow = new BrowserWindow({
      show: false,
      webPreferences: { nodeIntegration: false }
    });
    activePrintWindows.add(printWindow);

    let responseSent = false;

    printWindow.on('closed', () => {
      if (!responseSent) {
        responseSent = true;
        res.status(500).json({ error: "Print window closed unexpectedly" });
      }
      activePrintWindows.delete(printWindow);
    });

    printWindow.webContents.on('did-finish-load', async () => {
      // Wait a brief moment for fonts/images to render
      await new Promise(resolve => setTimeout(resolve, 800));
      
      if (!printWindow) return;
      
      const printOptions = {
        silent: true,
        printBackground: true,
        deviceName: targetPrinter,
        margins: { marginType: 'none' }
      };

      const handleResult = (success, failureReason) => {
        if (responseSent) return;
        responseSent = true;

        console.log(`Print result - Type: ${type}, Printer: ${targetPrinter}, Success: ${success}, Error: ${failureReason || 'None'}`);

        try {
          if (success) {
            console.log(`Print successful on ${targetPrinter}`);
            res.json({ success: true, message: `Successfully printed on ${targetPrinter}` });
          } else {
            console.error(`Print failed on ${targetPrinter}:`, failureReason);
            res.status(500).json({ error: "Print failed", reason: failureReason });
          }
        } finally {
          if (printWindow) {
            printWindow.destroy();
            activePrintWindows.delete(printWindow);
            printWindow = null;
          }
        }
      };

      try {
        const result = printWindow.webContents.print(printOptions, handleResult);
        if (result && typeof result.then === 'function') {
          result.then(() => handleResult(true, null)).catch(err => handleResult(false, String(err)));
        }
      } catch (err) {
        handleResult(false, String(err));
      }
    });

    await printWindow.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));
  } catch (err) {
    console.error("Error creating print window:", err);
    res.status(500).json({ error: "Internal Print Error" });
  }
}

expressApp.post('/print', async (req, res) => {
  const { type, html } = req.body;
  if (!html) return res.status(400).json({ error: "Missing html" });
  await processPrintJob(html, type, res);
});

expressApp.post('/test-print', async (req, res) => {
  const { type } = req.body;
  if (!type) return res.status(400).json({ error: "Missing type parameter" });
  await processPrintJob("<h1>Test Print</h1>", type, res);
});

expressApp.listen(2321, () => {
  console.log('RestroSaaS Print Node running on port 2321');
});

// Electron Setup
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 500,
    height: 400,
    title: "RestroSaaS Printer Settings",
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true
    }
  });

  mainWindow.loadFile('index.html');

  // Prevent closing, hide to tray instead
  mainWindow.on('close', (event) => {
    if (!app.isQuiting) {
      event.preventDefault();
      mainWindow.hide();
    }
  });
}

app.whenReady().then(() => {
  createWindow();

  // System Tray
  tray = new Tray(path.join(__dirname, 'tray-icon.png')); // Fallback gracefully if missing, we'll create a dummy or handle missing later
  const contextMenu = Menu.buildFromTemplate([
    { label: 'Open Settings', click: () => mainWindow.show() },
    { label: 'Quit', click: () => { app.isQuiting = true; app.quit(); } }
  ]);
  tray.setToolTip('RestroSaaS Print Node');
  tray.setContextMenu(contextMenu);
  tray.on('click', () => mainWindow.show());

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// IPC Handlers for React/HTML UI
ipcMain.handle('get-printers', async () => {
  if (mainWindow) {
    return await mainWindow.webContents.getPrintersAsync();
  }
  return [];
});

ipcMain.handle('get-settings', () => {
  return {
    kotPrinter: store.get('kotPrinter') || '',
    billPrinter: store.get('billPrinter') || ''
  };
});

ipcMain.on('save-settings', (event, settings) => {
  store.set('kotPrinter', settings.kotPrinter);
  store.set('billPrinter', settings.billPrinter);
});
