import { app } from 'electron';
import * as path from 'path';

// electron-builder's extraResources land under process.resourcesPath in a
// packaged app -- a different location entirely from the project's own
// resources/ dir, which is what __dirname-relative math resolves to when
// running unpackaged (`electron .`) straight from source. Branching on
// app.isPackaged is the standard way to handle both.
export function getResourcesRoot(): string {
  if (app.isPackaged) {
    return process.resourcesPath;
  }
  return path.join(__dirname, '..', '..', 'resources');
}

// The file to run to start this app again. Usually process.execPath, but not
// for an AppImage: that runs from a temporary mount (/tmp/.mount_<random>/)
// which gets a new name on every launch and disappears when the process
// that mounted it exits. The AppImage runtime puts the real file's path in
// $APPIMAGE.
export function getLaunchPath(): string {
  return process.env.APPIMAGE || process.execPath;
}
