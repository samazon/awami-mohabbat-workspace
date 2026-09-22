/**
 * R2 uploads via the wrangler CLI — argument arrays only, never a shell string.
 * Local uploads land in .wrangler/state (what `astro dev` serves); remote ones
 * use wrangler's own login, so the seed needs no R2 access keys at all.
 */
import { execFile } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { IMMUTABLE_CACHE_CONTROL } from '../src/lib/media';
import type { Target } from './d1';

const execFileP = promisify(execFile);

export interface Upload {
  key: string;
  contentType: string;
  /** Either a path on disk or bytes we derived in memory. */
  source: { path: string } | { buffer: Buffer };
}

export class R2Uploader {
  private tmp: string | null = null;

  constructor(
    private readonly root: string,
    private readonly bucket: string,
    private readonly target: Target,
  ) {}

  private wranglerBin() {
    return join(this.root, 'node_modules', '.bin', 'wrangler');
  }

  private async materialize(u: Upload): Promise<string> {
    if ('path' in u.source) return u.source.path;
    this.tmp ??= await mkdtemp(join(tmpdir(), 'am-seed-'));
    const file = join(this.tmp, u.key.replaceAll('/', '__'));
    await writeFile(file, u.source.buffer);
    return file;
  }

  async put(u: Upload): Promise<void> {
    const file = await this.materialize(u);
    const args = [
      'r2', 'object', 'put',
      `${this.bucket}/${u.key}`,
      '--file', file,
      '--content-type', u.contentType,
      '--cache-control', IMMUTABLE_CACHE_CONTROL,
      this.target === 'local' ? '--local' : '--remote',
    ];
    try {
      await execFileP(this.wranglerBin(), args, { cwd: this.root, maxBuffer: 8 * 1024 * 1024 });
    } catch (err) {
      const e = err as { stderr?: string; message: string };
      throw new Error(`R2 put failed for ${u.key}: ${(e.stderr ?? e.message).trim().split('\n').slice(-3).join(' ')}`);
    }
  }

  async close(): Promise<void> {
    if (this.tmp) await rm(this.tmp, { recursive: true, force: true });
    this.tmp = null;
  }
}
