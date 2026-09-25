import { describe, expect, it } from 'vitest';
import { assertSlug, columnistBannerKey } from '../src/lib/media';

describe('columnistBannerKey', () => {
  it('builds immutable, hashed keys', () => {
    expect(columnistBannerKey('iqbal-khokhar', 'card', 'a1b2c3d4e5f60718')).toBe(
      'columnists/iqbal-khokhar/banner-card.a1b2c3d4e5f60718.webp',
    );
    expect(columnistBannerKey('iqbal-khokhar', 'orig', 'a1b2c3d4e5f60718', 'png')).toBe(
      'columnists/iqbal-khokhar/banner-orig.a1b2c3d4e5f60718.png',
    );
  });

  it.each(['../etc', 'Iqbal', 'iqbal_khokhar', '', '-x', 'x-', 'a--b', 'a'.repeat(81)])('rejects slug %j', (slug) => {
    expect(() => assertSlug(slug)).toThrow(RangeError);
  });

  it('rejects a bad hash', () => {
    expect(() => columnistBannerKey('iqbal-khokhar', 'view', 'not-a-hash')).toThrow(RangeError);
  });
});
