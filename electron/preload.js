const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
  // Window controls
  minimize: () => ipcRenderer.send("window-minimize"),
  maximize: () => ipcRenderer.send("window-maximize"),
  close: () => ipcRenderer.send("window-close"),
  isMaximized: () => ipcRenderer.invoke("window:is-maximized"),
  focusWindow: () => ipcRenderer.send("app:focus-window"),
  onMaximizedChange: (callback) => {
    const handler = (_, maximized) => callback(maximized);
    ipcRenderer.on("window-maximized-change", handler);
    return () => ipcRenderer.removeListener("window-maximized-change", handler);
  },

  // Minecraft operations
  getInstalledModpacks: () => ipcRenderer.invoke("mc:get-installed-modpacks"),
  installModpack: (args) => ipcRenderer.invoke("mc:install-modpack", args),
  syncModpack: (args) => ipcRenderer.invoke("mc:sync-modpack", args),
  updateModpack: (args) => ipcRenderer.invoke("mc:update-modpack", args),
  installSnapshot: (args) => ipcRenderer.invoke("mc:install-snapshot", args),
  listInstanceFiles: (args) => ipcRenderer.invoke("mc:list-instance-files", args),
  deleteInstanceFile: (args) => ipcRenderer.invoke("mc:delete-instance-file", args),
  updateInstanceFile: (args) => ipcRenderer.invoke("mc:update-instance-file", args),
  downloadInstanceFile: (args) => ipcRenderer.invoke("mc:download-instance-file", args),
  readInstanceFile: (args) => ipcRenderer.invoke("mc:read-instance-file", args),
  launchMinecraft: (args) => ipcRenderer.invoke("mc:launch", args),
  checkJava: () => ipcRenderer.invoke("mc:check-java"),
  installJava: () => ipcRenderer.invoke("mc:install-java"),

  // Microsoft Auth (Device Code Flow + Silent Refresh)
  startDeviceCodeAuth: (args) => ipcRenderer.invoke("ms:device-code-auth", args),
  pollToken: (args) => ipcRenderer.invoke("ms:poll-token", args),
  refreshMsToken: (args) => ipcRenderer.invoke("ms:refresh-token", args),
  xboxAuth: (args) => ipcRenderer.invoke("ms:xbox-auth", args),
  xstsAuth: (args) => ipcRenderer.invoke("ms:xsts-auth", args),
  minecraftAuth: (args) => ipcRenderer.invoke("ms:mc-auth", args),
  getMinecraftProfile: (args) => ipcRenderer.invoke("ms:mc-profile", args),

  // Skin manager
  getSkinProfile: (args) => ipcRenderer.invoke("mc:get-skin-profile", args),
  changeSkin: (args) => ipcRenderer.invoke("mc:change-skin", args),
  setCape: (args) => ipcRenderer.invoke("mc:set-cape", args),
  skinLibraryList: () => ipcRenderer.invoke("mc:skin-library-list"),
  skinLibrarySave: (args) => ipcRenderer.invoke("mc:skin-library-save", args),
  skinLibraryDelete: (args) => ipcRenderer.invoke("mc:skin-library-delete", args),
  fetchTextureB64: (args) => ipcRenderer.invoke("mc:fetch-texture-b64", args),
  getSkinUrlForUuid: (args) => ipcRenderer.invoke("mc:get-skin-url", args),
  getUuidForUsername: (args) => ipcRenderer.invoke("mc:get-uuid-for-username", args),

  // File system / settings
  openInstanceFolder: (args) => ipcRenderer.invoke("mc:open-instance-folder", args),
  purgeXrayFiles: (args) => ipcRenderer.invoke("mc:purge-xray-files", args),
  listEmotes: (args) => ipcRenderer.invoke("mc:list-emotes", args),
  readSettings: () => ipcRenderer.invoke("fs:read-settings"),
  writeSettings: (settings) => ipcRenderer.invoke("fs:write-settings", settings),
  readAuth: () => ipcRenderer.invoke("fs:read-auth"),
  writeAuth: (auth) => ipcRenderer.invoke("fs:write-auth", auth),
  clearAuth: () => ipcRenderer.invoke("fs:clear-auth"),
  getDataDir: () => ipcRenderer.invoke("fs:get-data-dir"),
  chooseDataDir: () => ipcRenderer.invoke("fs:choose-data-dir"),
  openDataDir: () => ipcRenderer.invoke("fs:open-data-dir"),

  // GitHub
  fetchModpacks: (args) => ipcRenderer.invoke("github:fetch-modpacks", args),
  createRelease: (args) => ipcRenderer.invoke("github:create-release", args),

  // App info / error reporting
  getAppVersion: () => ipcRenderer.invoke("app:get-version"),
  onAppError: (callback) => {
    const handler = (_, data) => callback(data);
    ipcRenderer.on("app:error", handler);
    return () => ipcRenderer.removeListener("app:error", handler);
  },

  // Events from main process
  onInstallProgress: (callback) => {
    const handler = (_, data) => callback(data);
    ipcRenderer.on("install-progress", handler);
    return () => ipcRenderer.removeListener("install-progress", handler);
  },
  onLaunchStatus: (callback) => {
    const handler = (_, data) => callback(data);
    ipcRenderer.on("launch-status", handler);
    return () => ipcRenderer.removeListener("launch-status", handler);
  },
  onJavaInstallProgress: (callback) => {
    const handler = (_, data) => callback(data);
    ipcRenderer.on("java-install-progress", handler);
    return () => ipcRenderer.removeListener("java-install-progress", handler);
  },
  onPlaytimeSessionEnded: (callback) => {
    const handler = (_, data) => callback(data);
    ipcRenderer.on("playtime:session-ended", handler);
    return () => ipcRenderer.removeListener("playtime:session-ended", handler);
  },
});
