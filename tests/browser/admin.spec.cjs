const { test, expect } = require('@playwright/test');

test('demo can create, edit, hide and persist a product without changing the shop', async ({ page }, testInfo) => {
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto('/admin.html');
  await page.getByRole('button', { name: 'Probar el panel' }).click();
  await expect(page.locator('#stat-total')).toHaveText('8');
  await page.getByRole('button', { name: '+ Nuevo producto' }).click();
  await page.getByLabel('Nombre', { exact: true }).fill('Collar de prueba');
  await page.getByLabel('Precio en ARS').fill('2500.50');
  await page.getByLabel('Unidades en stock').fill('4');
  await page.getByLabel('Publicar en la tienda').check();
  await page.screenshot({ path: testInfo.outputPath('product-editor.png'), fullPage: true });
  await page.getByRole('button', { name: 'Guardar producto' }).click();
  await expect(page.locator('#stat-total')).toHaveText('9');
  await page.getByRole('button', { name: 'Editar Collar de prueba', exact: true }).click();
  await page.getByLabel('Unidades en stock').fill('0');
  await page.getByLabel('Publicar en la tienda').uncheck();
  await page.getByRole('button', { name: 'Guardar producto' }).click();
  await page.reload();
  await page.getByRole('button', { name: 'Probar el panel' }).click();
  await page.locator('#admin-search').fill('Collar de prueba');
  await expect(page.locator('.admin-product')).toHaveCount(1);
  await expect(page.locator('.admin-product')).toContainText('Oculto');
  await expect(page.locator('.admin-product')).toContainText('Agotado');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('dashboard.png'), fullPage: true });
  await page.goto('/index.html');
  await expect(page.locator('#product-grid')).not.toContainText('Collar de prueba');
  expect(errors).toEqual([]);
});

async function mockSupabase(page, initial, allowed = true) {
  let rows = initial;
  await page.route('**/js/config.js', route => route.fulfill({ contentType: 'application/javascript', body: `window.COQUETTE_CONFIG = {supabaseUrl:'https://example.supabase.co',supabaseKey:'sb_publishable_test',whatsappNumber:'5491112345678'};` }));
  await page.route('https://example.supabase.co/**', async route => {
    const request = route.request(), url = new URL(request.url());
    const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'authorization,apikey,content-type,prefer,x-upsert', 'access-control-allow-methods': 'GET, POST, PATCH, OPTIONS' };
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
    let body;
    if (url.pathname === '/auth/v1/token') body = { access_token: 'admin-token', refresh_token: 'refresh', expires_in: 3600 };
    else if (url.pathname === '/rest/v1/rpc/is_admin') body = allowed;
    else if (url.pathname === '/rest/v1/products') {
      if (request.method() === 'GET') body = url.searchParams.has('activo') ? rows.filter(p => p.activo) : rows;
      else {
        const data = request.postDataJSON();
        const id = request.method() === 'PATCH' ? Number(url.searchParams.get('id').slice(3)) : 20;
        const saved = { ...data, id, updated_at: new Date().toISOString() };
        rows = rows.some(p => p.id === id) ? rows.map(p => p.id === id ? saved : p) : [...rows, saved];
        body = [saved];
      }
    } else body = {};
    await route.fulfill({ json: body, headers: cors });
  });
  return { setRows(value) { rows = value; } };
}
const product = { id: 10, nombre: 'Collar real', categoria: 'Collares', precio: 1234.50, stock: 2, activo: true, destacado: true, nuevo: false, badge: '', imagen: 'assets/necklace.svg', updated_at: '2026-09-15T00:00:00Z' };

test('configured admin logs in and saves to remote catalog', async ({ page }) => {
  await mockSupabase(page, [product]);
  await page.goto('/admin.html');
  await expect(page.getByRole('button', { name: 'Probar el panel' })).toBeHidden();
  await page.getByLabel('Email', { exact: true }).fill('admin@example.com');
  await page.getByLabel('Contraseña', { exact: true }).fill('password');
  await page.getByRole('button', { name: 'Ingresar al panel' }).click();
  await page.getByRole('button', { name: 'Editar Collar real' }).click();
  await page.getByLabel('Precio en ARS').fill('4500');
  await page.getByLabel('Foto del producto', { exact: true }).setInputFiles({
    name: 'collar.png', mimeType: 'image/png',
    buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a3ioAAAAASUVORK5CYII=', 'base64')
  });
  await expect(page.locator('#image-preview')).toHaveAttribute('src', /^blob:/);
  const upload = page.waitForRequest(request => request.url().includes('/storage/v1/object/product-images/'));
  const write = page.waitForRequest(request => request.method() === 'PATCH');
  await page.getByRole('button', { name: 'Guardar producto' }).click();
  expect((await upload).headers()['content-type']).toBe('image/png');
  expect((await write).postDataJSON().imagen).toMatch(/object\/public\/product-images\/products\/.*\.png$/);
  await expect(page.locator('.admin-product')).toContainText('4.500');
  await page.getByRole('button', { name: 'Cerrar sesión' }).click();
  await expect(page.locator('#dashboard')).toBeHidden();
});

test('non-admin account cannot open the dashboard', async ({ page }) => {
  await mockSupabase(page, [product], false);
  await page.goto('/admin.html');
  await page.getByLabel('Email', { exact: true }).fill('other@example.com');
  await page.getByLabel('Contraseña', { exact: true }).fill('password');
  await page.getByRole('button', { name: 'Ingresar al panel' }).click();
  await expect(page.locator('#admin-status')).toContainText('no está autorizada');
  await expect(page.locator('#dashboard')).toBeHidden();
});

test('live cart respects stock, persists and revalidates prices before WhatsApp', async ({ page }) => {
  const backend = await mockSupabase(page, [product]);
  await page.goto('/');
  await page.getByRole('button', { name: 'Agregar Collar real al carrito' }).click();
  await page.getByRole('button', { name: 'Agregar Collar real al carrito' }).click();
  await page.reload();
  await page.getByRole('button', { name: 'Abrir carrito, 2 productos' }).click();
  await expect(page.getByRole('button', { name: 'Sumar una unidad de Collar real' })).toBeDisabled();
  await expect(page.locator('#cart-subtotal')).toContainText('2.469');
  backend.setRows([{ ...product, precio: 1500, stock: 1 }]);
  await page.getByRole('button', { name: 'Finalizar pedido por WhatsApp' }).click();
  await expect(page.locator('#whatsapp-status')).toContainText('Cambió el precio');
  await expect(page.locator('#cart-subtotal')).toContainText('1.500');
  await page.getByRole('button', { name: 'Finalizar pedido por WhatsApp' }).click();
  const link = page.getByRole('link', { name: 'Abrir pedido en WhatsApp' });
  await expect(link).toBeVisible();
  const url = new URL(await link.getAttribute('href'));
  expect(url.hostname).toBe('wa.me');
  expect(url.searchParams.get('text')).toContain('Collar real × 1');
  expect(url.searchParams.get('text')).not.toContain('demostración');
  await page.getByRole('button', { name: 'Eliminar Collar real' }).click();
  await expect(link).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Finalizar pedido por WhatsApp' })).toBeDisabled();
});

test('empty live catalog and network failure never show demo products', async ({ page }) => {
  await mockSupabase(page, []);
  await page.goto('/');
  await expect(page.locator('#coleccion .demo-note')).toContainText('Pronto');
  await expect(page.locator('.product-card')).toHaveCount(0);
  await page.route('https://example.supabase.co/rest/v1/products**', route => route.abort());
  await page.reload();
  await expect(page.getByRole('button', { name: 'Reintentar' })).toBeVisible();
  await expect(page.locator('.product-card')).toHaveCount(0);
});
