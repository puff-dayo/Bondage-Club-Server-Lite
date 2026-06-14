const path = require("path");
const fs = require("fs");
const yaml = require("js-yaml");

var ROOT_DIR = window.PROJECT_ROOT || process.cwd();
const CONFIG_PATH = path.join(ROOT_DIR, "config.yaml");
const SERVER_SCRIPT = path.join(ROOT_DIR, "app.js");
const DB_DIR = path.join(ROOT_DIR, "data");
const DB_PATH = path.join(DB_DIR, "bondage_club.db");

let serverModule = null;
let isStarting = false;
const _origLog = console.log;
const _origError = console.error;
const _origWarn = console.warn;

function _dbg(msg) {
  try { fs.appendFileSync(path.join(ROOT_DIR, "nwjs-debug.log"), new Date().toISOString() + " [renderer] " + msg + "\n"); } catch (_) {}
}

const $ = (id) => document.getElementById(id);
const portInput = $("port");
const bindInput = $("bind-address");
const dataDirInput = $("data-dir");
const saveConfigBtn = $("save-config");
const startBtn = $("start-btn");
const stopBtn = $("stop-btn");
const restartBtn = $("restart-btn");
const logOutput = $("log-output");
const clearLogBtn = $("clear-log-btn");
const autoScrollChk = $("auto-scroll");
const statusBadge = $("status-badge");
const serverInfo = $("server-info");
const refreshDbBtn = $("refresh-db-btn");
const dbAccountCount = $("db-account-count");
const dbSize = $("db-size");
const dbRefreshTime = $("db-refresh-time");

function appendLog(msg, level) {
  if (!logOutput) return;
  const timestamp = new Date().toLocaleTimeString();
  const line = document.createElement("div");
  line.className = "log-" + level;
  line.textContent = "[" + timestamp + "] " + msg;
  logOutput.appendChild(line);
  if (autoScrollChk && autoScrollChk.checked) {
    logOutput.scrollTop = logOutput.scrollHeight;
  }
}

function loadConfig() {
  try {
    const raw = fs.readFileSync(CONFIG_PATH, "utf8");
    const cfg = yaml.load(raw);
    if (cfg && cfg.server) {
      if (cfg.server.port != null) portInput.value = cfg.server.port;
      if (cfg.server.bind_address != null) bindInput.value = cfg.server.bind_address;
    }
    if (cfg && cfg.data && cfg.data.directory != null) dataDirInput.value = cfg.data.directory;
  } catch (e) {
    appendLog("Unable to read config.yaml; using default values", "warn");
  }
}

function saveConfig() {
  try {
    const raw = fs.readFileSync(CONFIG_PATH, "utf8");
    const cfg = yaml.load(raw) || {};
    if (!cfg.server) cfg.server = {};
    if (!cfg.data) cfg.data = {};
    cfg.server.port = parseInt(portInput.value, 10) || 4288;
    cfg.server.bind_address = bindInput.value.trim() || "127.0.0.1";
    cfg.data.directory = "./data";
    fs.writeFileSync(CONFIG_PATH, yaml.dump(cfg, { indent: 2, lineWidth: -1 }), "utf8");
    appendLog("Configuration saved", "success");
  } catch (e) {
    appendLog("Failed to save configuration: " + e.message, "error");
  }
}

function clearLog() {
  if (logOutput) logOutput.innerHTML = "";
}

function setupConsoleCapture() {
  console.log = function () {
    _origLog.apply(console, arguments);
    appendLog(Array.from(arguments).join(" "), "info");
  };
  console.error = function () {
    _origError.apply(console, arguments);
    appendLog(Array.from(arguments).join(" "), "error");
  };
  console.warn = function () {
    _origWarn.apply(console, arguments);
    appendLog(Array.from(arguments).join(" "), "warn");
  };
}

function restoreConsole() {
  console.log = _origLog;
  console.error = _origError;
  console.warn = _origWarn;
}

function setStatus(running, label) {
  if (!statusBadge || !startBtn || !stopBtn || !restartBtn || !serverInfo) return;
  statusBadge.className = "badge badge-" + (running ? "running" : isStarting ? "starting" : "stopped");
  statusBadge.textContent = label || (running ? "Running" : isStarting ? "Starting..." : "Stopped");
  startBtn.disabled = running || isStarting;
  stopBtn.disabled = !running && !isStarting;
  restartBtn.disabled = !running && !isStarting;
  serverInfo.textContent = running
    ? "Server is running - Port " + portInput.value
    : "Server is not running";
}

function startServer() {
  if (serverModule || isStarting) return;
  isStarting = true;
  setStatus(false, "Starting...");
  appendLog("Starting server...", "info");
  try {
    setupConsoleCapture();
    Object.keys(require.cache).forEach(function (key) {
      if (key.indexOf("node_modules") === -1) {
        delete require.cache[key];
      }
    });
    serverModule = require(SERVER_SCRIPT);
    setTimeout(function () {
      if (serverModule) {
        isStarting = false;
        setStatus(true, "Running");
        appendLog("Server started", "success");
      }
    }, 2000);
  } catch (err) {
    appendLog("Startup failed: " + (err.message || err), "error");
    cleanupServer();
  }
}

function stopServer() {
  if (!serverModule) return;
  appendLog("Stopping server...", "info");
  try {
    if (serverModule.stop) {
      serverModule.stop(function () {
        appendLog("Server stopped", "info");
        cleanupServer();
      });
    } else {
      appendLog("Server does not support stop operation", "warn");
      cleanupServer();
    }
  } catch (err) {
    appendLog("Failed to stop server: " + (err.message || err), "error");
    cleanupServer();
  }
}

function cleanupServer() {
  serverModule = null;
  isStarting = false;
  restoreConsole();
  setStatus(false, "Stopped");
}

function restartServer() {
  appendLog("Restarting server...", "info");
  if (serverModule) {
    if (serverModule.stop) {
      serverModule.stop(function () {
        serverModule = null;
        Object.keys(require.cache).forEach(function (key) {
          if (key.indexOf("node_modules") === -1) {
            delete require.cache[key];
          }
        });
        setTimeout(startServer, 500);
      });
    } else {
      cleanupServer();
      setTimeout(startServer, 500);
    }
  } else {
    startServer();
  }
}

function formatFileSize(bytes) {
  if (bytes === 0) return "0 B";
  var units = ["B", "KB", "MB", "GB"];
  var i = Math.floor(Math.log(bytes) / Math.log(1024));
  return (bytes / Math.pow(1024, i)).toFixed(i > 0 ? 1 : 0) + " " + units[i];
}

async function refreshDbStats() {
  try {
    if (fs.existsSync(DB_PATH)) {
      var stat = fs.statSync(DB_PATH);
      if (dbSize) dbSize.textContent = formatFileSize(stat.size);
    } else {
      if (dbSize) dbSize.textContent = "File does not exist";
    }
    try {
      var initSqlJs = require("sql.js");
      var SQL = await initSqlJs();
      var buffer = fs.readFileSync(DB_PATH);
      var db = new SQL.Database(buffer);
      var result = db.exec("SELECT COUNT(*) as cnt FROM accounts");
      db.close();
      if (result.length > 0 && result[0].values.length > 0) {
        if (dbAccountCount) dbAccountCount.textContent = result[0].values[0][0];
      } else {
        if (dbAccountCount) dbAccountCount.textContent = "0";
      }
    } catch (_dbErr) {
      if (dbAccountCount) dbAccountCount.textContent = "Unable to read";
    }
    if (dbRefreshTime) dbRefreshTime.textContent = new Date().toLocaleTimeString();
  } catch (e) {
    appendLog("Failed to refresh database information: " + e.message, "error");
  }
}

try {
  _dbg("init starting");
  loadConfig();
  refreshDbStats();
  saveConfigBtn.addEventListener("click", saveConfig);
  startBtn.addEventListener("click", startServer);
  stopBtn.addEventListener("click", stopServer);
  restartBtn.addEventListener("click", restartServer);
  clearLogBtn.addEventListener("click", clearLog);
  refreshDbBtn.addEventListener("click", refreshDbStats);
  setInterval(refreshDbStats, 30000);
  appendLog("Admin panel loaded. Waiting for action...", "success");
  _dbg("init completed");
} catch (e) {
  _dbg("init FAILED: " + (e.message || e) + " " + (e.stack || ""));
  if (logOutput) {
    var line = document.createElement("div");
    line.className = "log-error";
    line.textContent = "[Fatal Error] " + (e.message || String(e));
    logOutput.appendChild(line);
  }
}
