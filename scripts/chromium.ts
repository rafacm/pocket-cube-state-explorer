// Shared launch settings for headless Chromium (scripts and end-to-end tests).
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

/** Software WebGL (SwiftShader), so the explorer renders without a GPU. */
export const CHROMIUM_ARGS = ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];

/**
 * The environment for Chromium. When scripts/headless-deps.sh has unpacked libraries and fonts
 * into .cache/headless/ (machines without root), point Chromium at them.
 */
export function chromiumEnv(): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [k, v] of Object.entries(process.env)) if (v !== undefined) env[k] = v;
  const local = resolve(import.meta.dirname, '..', '.cache/headless');
  if (existsSync(join(local, 'fonts.conf'))) {
    env.LD_LIBRARY_PATH = [join(local, 'root/usr/lib/aarch64-linux-gnu'), join(local, 'root/usr/lib/x86_64-linux-gnu'), env.LD_LIBRARY_PATH]
      .filter(Boolean).join(':');
    env.FONTCONFIG_FILE = join(local, 'fonts.conf');
  }
  return env;
}
