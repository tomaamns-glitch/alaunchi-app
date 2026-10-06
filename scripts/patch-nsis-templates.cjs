// electron-builder `beforePack` hook (see electron-builder.yml) — runs before
// every build, patches the NSIS templates in node_modules, idempotently.
//
// Why: on every auto-update the installer AND the old version's uninstaller
// call SHChangeNotify(SHCNE_ASSOCCHANGED), which makes Explorer reload EVERY
// icon on the desktop: the desktop freezes for a moment and the shortcut looks
// like it's deleted and re-added — even though, on updates, electron-builder
// already keeps the shortcuts as they are (--keep-shortcuts).
//
// It can't just be dropped, though (1.9.7 did, and the shortcut kept a blank
// icon: Explorer caches a generic one while the .exe is briefly missing during
// the update). So on updates the installer refreshes only ITS OWN items —
// desktop shortcut, Start menu entry and the exe — with SHCNE_UPDATEITEM, and
// the uninstaller (whose refresh the installer's makes redundant) skips it. A
// real install/uninstall keeps the original full refresh.
//
// The uninstaller that runs during an update is the one shipped with the
// PREVIOUS version, so that half takes effect one release later.
const fs = require("fs");
const path = require("path");

const TEMPLATES = path.join(__dirname, "..", "node_modules", "app-builder-lib", "templates", "nsis");
const MARK = "; [alaunchi] targeted icon refresh on update v2";
// What an older version of this script left behind (1.9.7/1.9.8), upgraded in place.
const OLD_MARK = "; [alaunchi] skip icon refresh on update";
const NL = "\n";

// SHCNE_UPDATEITEM = 0x2000, SHCNF_PATHW = 0x0005
const updateItem = (indent, v) => `${indent}System::Call 'Shell32::SHChangeNotify(i 0x2000, i 0x0005, w "${v}", i 0)'`;

const PATCHES = [
  {
    file: path.join(TEMPLATES, "include", "installer.nsh"),
    from: "      System::Call 'Shell32::SHChangeNotify(i 0x8000000, i 0, i 0, i 0)'",
    oldPatched: [
      `      ${OLD_MARK}`,
      "      ${ifNot} ${isUpdated}",
      "        System::Call 'Shell32::SHChangeNotify(i 0x8000000, i 0, i 0, i 0)'",
      "      ${endIf}",
    ].join(NL),
    to: [
      `      ${MARK}`,
      "      ${if} ${isUpdated}",
      updateItem("        ", "$newDesktopLink"),
      updateItem("        ", "$newStartMenuLink"),
      updateItem("        ", "$appExe"),
      "      ${else}",
      "        System::Call 'Shell32::SHChangeNotify(i 0x8000000, i 0, i 0, i 0)'",
      "      ${endIf}",
    ].join(NL),
  },
  {
    file: path.join(TEMPLATES, "uninstaller.nsh"),
    from: "  System::Call 'shell32::SHChangeNotify(i, i, i, i) v (0x08000000, 0, 0, 0)'",
    oldPatched: [
      `  ${OLD_MARK}`,
      "  ${ifNot} ${isUpdated}",
      "    System::Call 'shell32::SHChangeNotify(i, i, i, i) v (0x08000000, 0, 0, 0)'",
      "  ${endIf}",
    ].join(NL),
    to: [
      `  ${MARK}`,
      "  ${ifNot} ${isUpdated}",
      "    System::Call 'shell32::SHChangeNotify(i, i, i, i) v (0x08000000, 0, 0, 0)'",
      "  ${endIf}",
    ].join(NL),
  },
];

function patchNsisTemplates() {
  for (const p of PATCHES) {
    let src = fs.readFileSync(p.file, "utf8");
    const rel = path.relative(process.cwd(), p.file);
    if (src.includes(MARK)) {
      console.log(`[patch-nsis] Ya parcheado: ${rel}`);
      continue;
    }
    if (src.includes(OLD_MARK)) {
      if (!src.includes(p.oldPatched)) throw new Error(`[patch-nsis] ${rel} tiene un parche antiguo irreconocible.`);
      src = src.replace(p.oldPatched, p.from);
    }
    const count = src.split(p.from).length - 1;
    if (count !== 1) {
      // The template changed (electron-builder update) — fail loudly instead of
      // silently shipping an installer without the fix.
      throw new Error(`[patch-nsis] Esperaba 1 coincidencia en ${rel} y hay ${count}. Revisa el parche.`);
    }
    fs.writeFileSync(p.file, src.replace(p.from, p.to));
    console.log(`[patch-nsis] Parcheado ${rel}`);
  }
}

module.exports = async function beforePack() {
  patchNsisTemplates();
};
module.exports.default = module.exports;

if (require.main === module) patchNsisTemplates();
