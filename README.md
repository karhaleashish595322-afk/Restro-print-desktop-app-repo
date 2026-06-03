# RestroSaaS Print Node

This is the local desktop application that handles silent printing for the Matanwada Hub POS system.

## Setup for Development
1. Open this folder in your terminal.
2. Run `npm install` to install dependencies.
3. Run `npm start` to run the app locally.

## How to build the .exe Installer
To package this app into a professional `.exe` installer for the hotel admins:

1. Make sure you stop the app if it is currently running in your terminal (press `Ctrl + C`).
2. Run this command to install the builder locally (bypasses Windows permission errors):
   `npm install --save-dev electron-builder`
3. Run the build command:
   `npm run build`

4. The installer will be generated in the `dist` folder. You can upload this `.exe` file to Supabase or GitHub!
