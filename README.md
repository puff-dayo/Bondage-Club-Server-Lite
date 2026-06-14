## Bondage Club Server Lite

A lightweight, standalone version of the Bondage Club server that runs locally without Docker or MongoDB, with a friendly GUI.

Main parts of code are based on Ben987's original repo [Bondage-Club-Server](https://github.com/Ben987/Bondage-Club-Server).

### Changes from the original
- Removed Docker, MongoDB, Nginx dependencies
- Uses SQLite for data storage
- Configuration via a GUI or `config.yaml`
- Binds to `127.0.0.1` only by default

### Building

Build a standalone Windows executable and zip archive:

```bash
npm run build
```

Output will be in `dist/`:
- `BC-Server-Lite.exe`
- `BC-Server-Lite-win-x64-{version}.zip`, the distributable archive

Requires: Node.js, optional upx.
