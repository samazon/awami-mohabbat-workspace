import { SignJWT, createLocalJWKSet, exportJWK, generateKeyPair } from 'jose';
import { describe, expect, it } from 'vitest';
import { adminUsers } from '../src/lib/db/schema';
import { authenticate, verifyAccessToken } from '../src/lib/admin/access';
import { testDb } from './helpers/db';

const cfg = { teamDomain: 'awamimohabbat', aud: 'aud-123' };
const ISS = 'https://awamimohabbat.cloudflareaccess.com';

async function keys() {
  const { publicKey, privateKey } = await generateKeyPair('RS256');
  const jwk = { ...(await exportJWK(publicKey)), kid: 'k1', alg: 'RS256' };
  return { privateKey, jwks: createLocalJWKSet({ keys: [jwk] }) };
}
const token = (key: CryptoKey, claims: Record<string, unknown>, { iss = ISS, aud = cfg.aud, exp = '5m' } = {}) =>
  new SignJWT(claims).setProtectedHeader({ alg: 'RS256', kid: 'k1' }).setIssuer(iss).setAudience(aud).setIssuedAt().setExpirationTime(exp).sign(key);
const headers = (t?: string) => new Headers(t ? { 'cf-access-jwt-assertion': t } : {});

describe('verifyAccessToken', () => {
  it('accepts a valid token and returns its lower-cased email', async () => {
    const k = await keys();
    expect(await verifyAccessToken(await token(k.privateKey, { email: 'Sommer@Example.com' }), cfg, k.jwks)).toBe('sommer@example.com');
  });
  it('rejects wrong audience, wrong issuer, expired, forged and malformed tokens', async () => {
    const k = await keys();
    const other = await keys();
    expect(await verifyAccessToken(await token(k.privateKey, { email: 'a@b.co' }, { aud: 'other' }), cfg, k.jwks)).toBeNull();
    expect(await verifyAccessToken(await token(k.privateKey, { email: 'a@b.co' }, { iss: 'https://evil.cloudflareaccess.com' }), cfg, k.jwks)).toBeNull();
    expect(await verifyAccessToken(await token(k.privateKey, { email: 'a@b.co' }, { exp: '-1m' }), cfg, k.jwks)).toBeNull();
    expect(await verifyAccessToken(await token(other.privateKey, { email: 'a@b.co' }), cfg, k.jwks)).toBeNull();
    expect(await verifyAccessToken('not.a.jwt', cfg, k.jwks)).toBeNull();
    expect(await verifyAccessToken(await token(k.privateKey, {}), cfg, k.jwks)).toBeNull(); // no email
  });
  it('refuses a bad team domain outright', async () => {
    const k = await keys();
    expect(await verifyAccessToken(await token(k.privateKey, { email: 'a@b.co' }), { teamDomain: 'evil.com/x', aud: 'a' }, k.jwks)).toBeNull();
  });
});

describe('authenticate (deny by default)', () => {
  const seed = async () => {
    const { db } = testDb();
    await db.insert(adminUsers).values([
      { email: 'boss@paper.pk', name: 'Boss', active: true, createdAt: 1 },
      { email: 'gone@paper.pk', name: 'Gone', active: false, createdAt: 1 },
    ]);
    return db;
  };
  it('lets in an active admin with a valid token', async () => {
    const db = await seed();
    const k = await keys();
    const r = await authenticate(db, headers(await token(k.privateKey, { email: 'boss@paper.pk' })), cfg, { keys: k.jwks });
    expect(r).toMatchObject({ ok: true, admin: { email: 'boss@paper.pk' } });
  });
  it('refuses: not configured, no token, bad token, unknown email, inactive admin', async () => {
    const db = await seed();
    const k = await keys();
    expect(await authenticate(db, headers('x'), null)).toEqual({ ok: false, reason: 'not-configured' });
    expect(await authenticate(db, headers(), cfg, { keys: k.jwks })).toEqual({ ok: false, reason: 'no-token' });
    expect(await authenticate(db, headers('x.y.z'), cfg, { keys: k.jwks })).toEqual({ ok: false, reason: 'bad-token' });
    const stranger = await token(k.privateKey, { email: 'stranger@x.com' });
    expect(await authenticate(db, headers(stranger), cfg, { keys: k.jwks })).toEqual({ ok: false, reason: 'not-admin' });
    const gone = await token(k.privateKey, { email: 'gone@paper.pk' });
    expect(await authenticate(db, headers(gone), cfg, { keys: k.jwks })).toEqual({ ok: false, reason: 'not-admin' });
  });
  it('the dev identity still has to be an active admin', async () => {
    const db = await seed();
    expect((await authenticate(db, headers(), null, { devEmail: 'BOSS@paper.pk' })).ok).toBe(true);
    expect(await authenticate(db, headers(), null, { devEmail: 'nobody@x.com' })).toEqual({ ok: false, reason: 'not-admin' });
  });
});
