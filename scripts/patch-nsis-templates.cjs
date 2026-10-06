// electron-builder `beforePack` hook (see electron-builder.yml) — runs before
// every build, patches the NSIS templates in node_modules, idempotently.
//
// Why: on every auto-update the installer AND the old version's uninstaller
// call SHChangeNotify(SHCNE_ASSOCCHANGED), which makes Explorer reload every
// icon on the desktop. The desktop freezes for a moment and the shortcut looks
// like it's deleted and re-added — even though, on updates, electron-builder
// already keeps the shortcuts as they are (--keep-shortcuts). We only skip that
// refresh when updating; a real install/uninstall still does it.
//
// The uninstaller that runs during an update is the one shipped with the
// PREVIOUS version, so the uninstall half of this takes effect from the second
// update after the first patched release.
const fs = require("fs");
const path = require("path");

const TEMPLATES = path.join(__dirname, "..", "node_modules", "app-builder-lib", "templates", "nsis");
const MARK = "; [alaunchi] skip icon refresh on update";

const PATCHES = [
  {
    file: path.join(TEMPLATES, "include", "installer.nsh"),
    from: "      System::Call 'Shell32::SHChangeNotify(i 0x8000000, i 0, i 0, i 0)'",
    to: [
      `      ${MARK}`,
      "      ${ifNot} ${isUpdated}",
      "        System::Call 'Shell32::SHChangeNotify(i 0x8000000, i 0, i 0, i 0)'",
      "      ${endIf}",
    ].join("\n"),
  },
  {
    file: path.join(TEMPLATES, "uninstaller.nsh"),
    from: "  System::Call 'shell32::SHChangeNotify(i, i, i, i) v (0x08000000, 0, 0, 0)'",
    to: [
      `  ${MARK}`,
      "  ${ifNot} ${isUpdated}",
      "    System::Call 'shell32::SHChangeNotify(i, i, i, i) v (0x08000000, 0, 0, 0)'",
      "  ${endIf}",
    ].join("\n"),
  },
];

function patchNsisTemplates() {
  for (const p of PATCHES) {
    const src = fs.readFileSync(p.file, "utf8");
    if (src.includes(MARK)) {
      console.log(`[patch-nsis] Ya parcheado: ${path.relative(process.cwd(), p.file)}`);
      continue;
    }
    const count = src.split(p.from).length - 1;
    if (count !== 1) {
      // The template changed (electron-builder update) — fail loudly instead of
      // silently shipping an installer without the fix.
      throw new Error(`[patch-nsis] Esperaba 1 coincidencia en ${p.file} y hay ${count}. Revisa el parche.`);
    }
    fs.writeFileSync(p.file, src.replace(p.from, p.to));
    console.log(`[patch-nsis] Parcheado ${path.relative(process.cwd(), p.file)}`);
  }
}

module.exports = async function beforePack() {
  patchNsisTemplates();
};
module.exports.default = module.exports;

if (require.main === module) patchNsisTemplates();
