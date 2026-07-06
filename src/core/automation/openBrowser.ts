import { spawn } from 'child_process';

/**
 * Open a URL in the USER'S REAL default browser (not our Playwright browser).
 * Needed for ATS whose anti-bot blocks automated browsers entirely (e.g.
 * SmartRecruiters shows "Access is temporarily restricted"). In the user's own
 * browser they have a legit fingerprint + session, so the offer loads normally.
 * Runs on the user's machine (worker / local Next.js server).
 */
export function openInDefaultBrowser(url: string): boolean {
  try {
    if (process.platform === 'win32') {
      // `start` is a cmd builtin; the empty "" is the window-title arg.
      spawn('cmd', ['/c', 'start', '', url], { detached: true, stdio: 'ignore' }).unref();
    } else if (process.platform === 'darwin') {
      spawn('open', [url], { detached: true, stdio: 'ignore' }).unref();
    } else {
      spawn('xdg-open', [url], { detached: true, stdio: 'ignore' }).unref();
    }
    return true;
  } catch (e) {
    console.warn('[openBrowser] failed to open default browser:', (e as Error)?.message ?? e);
    return false;
  }
}
