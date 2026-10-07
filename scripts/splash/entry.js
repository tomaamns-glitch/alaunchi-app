// Entry for electron/splash-effects.js: exposes the splash's WebGL effects to
// its inline script (electron/splash.html has no bundler of its own).
import { mountCrystalizedBall } from './crystal-ball.js';
import { mountGradientWaves } from './gradient-waves.js';
import { mountElectricLogo } from './electric-logo.js';
// The logo's arch and door as white masks, inlined as data URLs: the splash is
// a file:// page, and reading pixels of a file:// image taints the canvas.
import logoArch from './logo-arch.png';
import logoDoor from './logo-door.png';

window.mountCrystalizedBall = mountCrystalizedBall;
window.mountGradientWaves = mountGradientWaves;
window.mountElectricLogo = mountElectricLogo;
window.splashLogoMasks = { arch: logoArch, door: logoDoor };
