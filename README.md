# AutoFeel - AI Form Helper Chrome Extension

AutoFeel is a Chrome Extension (Manifest V3) that acts as an AI-powered form assistant. It allows users to automatically fill form fields using a mock AI backend, supporting both single-field interactions and multi-field block selections.

## Features

*   **Single Field Fill**: Hold `Alt` + `Left-Click` on any input or textarea to auto-fill it.
*   **Block Selection Mode**: Press `Ctrl` + `Shift` + `A` to enter selection mode. Drag to select multiple fields and send a snapshot of the area to the backend.
*   **Visual Feedback**:
    *   **Filling**: Floating/Loading effect.
    *   **Success**: Green flash animation.
    *   **Fail**: Red shake animation.
*   **Configurable API**: Point the extension to any backend via the Options page.

## Project Structure

```
AutoFeel/
├── extension/          # Chrome Extension Source
│   ├── dist/           # Built files (contentScript.js, background.js)
│   ├── options/        # Options page
│   ├── src/            # Modular source code
│   │   ├── contentScript.js
│   │   ├── background.js
│   │   ├── selectionMode.js
│   │   ├── domDescriptors.js
│   │   └── styles.js
│   ├── build.js        # Build script (esbuild)
│   └── manifest.json
└── server/             # Stub Node.js API Server
    ├── server.js
    └── package.json
```

## Setup Instructions

### 1. Backend Server

The extension requires a running backend server to handle requests.

1.  Navigate to the `server` directory:
    ```bash
    cd server
    ```
2.  Install dependencies:
    ```bash
    npm install
    ```
3.  Start the server:
    ```bash
    npm start
    ```
    *The server will listen on `http://localhost:3000`.*

### 2. Chrome Extension

1.  Navigate to the `extension` directory:
    ```bash
    cd extension
    ```
2.  Install dependencies (for building):
    ```bash
    npm install
    ```
3.  Build the extension:
    ```bash
    node build.js
    ```
    *This creates/updates the `dist/` folder.*

4.  **Load into Chrome**:
    *   Open Chrome and navigate to `chrome://extensions/`.
    *   Enable **Developer mode** (top right toggle).
    *   Click **Load unpacked**.
    *   Select the `extension` folder (`/path/to/AutoFeel/extension`).

## Usage

1.  Ensure the server is running (`npm start` in `server/`).
2.  Open any web page with forms (e.g., a contact form).
3.  **Single Field Interaction**:
    *   Hold `Alt` and click an input field.
    *   The field should fill with "Demo Value" (or specific values for "First Name"/"Last Name").
4.  **Selection Mode**:
    *   Press `Ctrl` + `Shift` + `A`.
    *   The cursor changes to a crosshair.
    *   Click and drag to draw a box around multiple fields.
    *   The primary field (top-left) will attempt to fill, and the server logs will show the "block snapshot" containing all selected fields.

## Troubleshooting

*   **"Extension context invalidated"**: This error occurs if you reload the extension (in `chrome://extensions/`) while a web page is still open. The content script on the page becomes orphaned. **Solution**: Refresh the web page.
*   **Network Error / Fail Animation**: Ensure the server is running on `http://localhost:3000`. Check the extension options to verify the API URL.

## Development

*   **Source Code**: Edit files in `extension/src/`.
*   **Rebuild**: After changing source files, run `node build.js` inside the `extension/` folder to update the `dist/` bundles.
*   **Reload**: Click the refresh icon on the extension card in `chrome://extensions/` and reload your test page.
