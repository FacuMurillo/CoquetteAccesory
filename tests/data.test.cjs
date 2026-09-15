const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function setup(responses = [], config = { supabaseUrl: 'https://example.supabase.co', supabaseKey: 'sb_publishable_test' }) {
  const calls = [], storage = new Map();
  const context = {
    window: { COQUETTE_CONFIG: config, COQUETTE_PRODUCTS: [{ id: 1, nombre: 'Collar', categoria: 'Collares', precio: 100, imagen: 'assets/necklace.svg' }] },
    Blob, AbortController, crypto: require('node:crypto').webcrypto, atob, setTimeout, clearTimeout,
    localStorage: { getItem: key => storage.get(key), setItem: (key, value) => storage.set(key, value) },
    fetch: async (url, options) => {
      calls.push({ url, ...options });
      const next = responses.shift();
      if (!next) throw new Error('Unexpected request: ' + url);
      return { ok: (next.status || 200) < 400, status: next.status || 200, text: async () => JSON.stringify(next.body) };
    }
  };
  vm.runInNewContext(fs.readFileSync('js/data.js', 'utf8'), context);
  return { api: context.window.CoquetteData, calls, storage };
}
const valid = { nombre: 'Aurora', categoria: 'Collares', precio: 18900.50, stock: 2, activo: true, destacado: true };
const session = { access_token: 'user-token', refresh_token: 'refresh-token', expires_in: 3600 };

test('validates product price, stock, category and unsafe image paths', () => {
  const { api } = setup();
  assert.equal(api.validateProduct(valid).precio, 18900.5);
  for (const patch of [{ precio: -1 }, { precio: NaN }, { precio: 1.111 }, { stock: -1 }, { stock: 1.5 }, { stock: 100000 }, { categoria: 'Other' }, { nombre: ' ' }]) {
    assert.throws(() => api.validateProduct({ ...valid, ...patch }));
  }
  assert.equal(api.safeImage('javascript:alert(1)'), 'assets/placeholder.svg');
  assert.equal(api.safeImage('https://example.com/" onerror="alert(1)'), 'assets/placeholder.svg');
});
test('public catalog reads only active products and does not send an admin token', async () => {
  const { api, calls } = setup([{ body: [{ id: 1, precio: '125.50', stock: 3 }] }]);
  const rows = await api.listProducts();
  assert.equal(rows[0].precio, 125.5);
  assert.match(calls[0].url, /activo=eq.true/);
  assert.equal(calls[0].headers.Authorization, undefined);
});
test('write and private read require login before making any request', async () => {
  const { api, calls } = setup();
  await assert.rejects(api.saveProduct(valid), /Iniciá sesión/);
  await assert.rejects(api.listProducts(true), /Iniciá sesión/);
  assert.equal(calls.length, 0);
});
test('a signed-in non-admin is denied and cannot retain a write session', async () => {
  const { api, calls } = setup([{ body: session }, { body: false }]);
  await assert.rejects(api.login('someone@example.com', 'password'), /no está autorizada/);
  await assert.rejects(api.saveProduct(valid), /Iniciá sesión/);
  assert.equal(calls.length, 2);
});
test('admin updates include version precondition and report conflicts', async () => {
  const { api, calls } = setup([{ body: session }, { body: true }, { body: [] }]);
  await api.login('admin@example.com', 'password');
  await assert.rejects(api.saveProduct(valid, { id: 12, updated_at: '2026-09-15T12:00:00Z' }), /Otra persona/);
  assert.match(calls[2].url, /id=eq.12&updated_at=eq./);
  assert.equal(calls[2].headers.Authorization, 'Bearer user-token');
  assert.equal(calls[2].method, 'PATCH');
});
test('expired session refreshes before writes; logout clears session even on network rejection', async () => {
  const { api, calls } = setup([{ body: { ...session, expires_in: 0 } }, { body: session }, { body: true }, { body: [{ ...valid, id: 1 }] }, { status: 503 }]);
  await api.login('admin@example.com', 'password');
  await api.saveProduct(valid);
  assert.match(calls[1].url, /grant_type=refresh_token/);
  await assert.rejects(api.logout());
  await assert.rejects(api.saveProduct(valid), /Iniciá sesión/);
});
test('uploads reject disallowed types and large files, then use unique public photo paths', async () => {
  const { api, calls } = setup([{ body: session }, { body: true }, { body: { Key: 'test' } }]);
  await api.login('admin@example.com', 'password');
  await assert.rejects(api.uploadImage(new Blob(['<svg/>'], { type: 'image/svg+xml' })), /JPG/);
  await assert.rejects(api.uploadImage(new Blob([new Uint8Array(5242881)], { type: 'image/png' })), /5 MB/);
  const url = await api.uploadImage(new Blob(['image'], { type: 'image/jpeg' }));
  assert.match(url, /storage\/v1\/object\/public\/product-images\/products\/.*\.jpg$/);
  assert.equal(calls[2].headers['x-upsert'], 'false');
});
test('partial config and secret keys fail closed', async () => {
  for (const config of [{ supabaseUrl: 'https://example.supabase.co', supabaseKey: '' }, { supabaseUrl: 'https://example.supabase.co', supabaseKey: 'sb_secret_wrong' }]) {
    const { api, calls } = setup([], config);
    assert.equal(api.configured, true);
    await assert.rejects(api.listProducts());
    assert.equal(calls.length, 0);
  }
});
test('demo saves are isolated from storefront cart/catalog', () => {
  const { api, storage } = setup([], {});
  const rows = api.demoProducts();
  rows[0].precio = 500;
  api.saveDemo(rows);
  assert.equal(api.demoProducts()[0].precio, 500);
  assert.deepEqual([...storage.keys()], ['coquette.admin.demo.v1']);
});
