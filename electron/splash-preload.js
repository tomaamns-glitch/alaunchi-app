const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("splashAPI", {
  onState: (callback) => {
    const handler = (_, data) => callback(data);
    ipcRenderer.on("splash:state", handler);
    return () => ipcRenderer.removeListener("splash:state", handler);
  },
});
