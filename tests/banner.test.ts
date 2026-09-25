import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { BANNER_MAX_BYTES, deriveBanner } from '../scripts/ingest';

const image = (width: number, height: number, format: 'png' | 'jpeg' | 'gif') =>
  sharp({ create: { width, height, channels: 3, background: '#888888' } })[format]().toBuffer();

describe('deriveBanner', () => {
  it('makes card and view WebPs, keeps the original size and hash', async () => {
    const out = await deriveBanner(await image(1804, 1250, 'png'));
    expect(out.width).toBe(1804);
    expect(out.height).toBe(1250);
    expect(out.origExt).toBe('png');
    expect(out.hash).toMatch(/^[a-f0-9]{16}$/);
    expect(out.variants.map((v) => [v.variant, v.width])).toEqual([['card', 480], ['view', 960]]);
  });

  it('never upscales a small banner', async () => {
    const out = await deriveBanner(await image(700, 485, 'jpeg'));
    expect(out.origExt).toBe('jpg');
    expect(out.variants.map((v) => v.width)).toEqual([480, 700]);
  });

  it('rejects formats other than JPEG and PNG', async () => {
    await expect(deriveBanner(await image(100, 100, 'gif'))).rejects.toThrow(/JPEG or PNG/);
  });

  it('rejects files over 10 MB before decoding them', async () => {
    await expect(deriveBanner(Buffer.alloc(BANNER_MAX_BYTES + 1))).rejects.toThrow(/10 MB/);
  });

  it('rejects a file that is not an image at all', async () => {
    await expect(deriveBanner(Buffer.from('{"name":"x"}'))).rejects.toThrow(/JPEG or PNG/);
  });
});
