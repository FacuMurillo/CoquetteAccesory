/* Acceso a Supabase mediante fetch: sin frameworks ni dependencias externas. */
(() => {
  'use strict';
  const config = window.COQUETTE_CONFIG || {};
  const url = (config.supabaseUrl || '').replace(/\/$/, '');
  const key = config.supabaseKey || '';
  const configured = Boolean(url || key);
  const demoKey = 'coquette.admin.demo.v1';
  let session = null; // Solo en memoria: recargar el panel requiere iniciar sesión.
  let refreshPromise;

  function validateConfig() {
    if (!/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(url) || !key) throw new Error('Revisá la URL y la clave pública de Supabase en js/config.js.');
    if (key.startsWith('sb_secret_')) throw new Error('Usá únicamente una clave pública de Supabase.');
    if (key.startsWith('eyJ')) {
      try { if (JSON.parse(atob(key.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))).role !== 'anon') throw new Error(); }
      catch { throw new Error('La clave debe ser publishable o anon; nunca service_role.'); }
    } else if (!key.startsWith('sb_publishable_')) throw new Error('La clave pública de Supabase no es válida.');
  }

  async function request(path, { method = 'GET', body, token, headers = {} } = {}) {
    validateConfig();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20000);
    try {
      const response = await fetch(url + path, {
        method, signal: controller.signal, cache: 'no-store',
        headers: { apikey: key, ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...(body && !(body instanceof Blob) ? { 'Content-Type': 'application/json' } : {}), ...headers },
        body: body instanceof Blob ? body : body ? JSON.stringify(body) : undefined
      });
      const text = await response.text();
      let result;
      try { result = text ? JSON.parse(text) : null; } catch { result = null; }
      if (!response.ok) {
        const error = new Error(response.status === 401 || response.status === 403
          ? 'No tenés acceso o la sesión venció. Volvé a iniciar sesión.'
          : response.status === 409 ? 'El producto cambió. Actualizá la lista antes de guardar.'
          : response.status === 413 ? 'La imagen supera el tamaño permitido.'
          : 'No se pudo completar la operación. Revisá la conexión y la configuración de Supabase.');
        error.status = response.status;
        throw error;
      }
      return result;
    } catch (error) {
      if (error.name === 'AbortError') throw new Error('La conexión tardó demasiado. Volvé a intentarlo.');
      throw error;
    } finally { clearTimeout(timeout); }
  }

  async function accessToken() {
    if (!session) throw new Error('Iniciá sesión para administrar la tienda.');
    if (Date.now() >= session.expiresAt - 60000) {
      if (!refreshPromise) refreshPromise = request('/auth/v1/token?grant_type=refresh_token', {
        method: 'POST', body: { refresh_token: session.refresh_token }
      }).then(setSession).catch(error => { session = null; throw error; }).finally(() => { refreshPromise = null; });
      await refreshPromise;
    }
    return session.access_token;
  }
  function setSession(value) { session = { ...value, expiresAt: Date.now() + value.expires_in * 1000 }; return session; }
  async function login(email, password) {
    session = null;
    try {
      setSession(await request('/auth/v1/token?grant_type=password', { method: 'POST', body: { email, password } }));
      const allowed = await request('/rest/v1/rpc/is_admin', { method: 'POST', body: {}, token: await accessToken() });
      if (allowed !== true) throw new Error('Esta cuenta no está autorizada para administrar Coquette.');
    } catch (error) { session = null; throw error; }
  }
  async function logout() {
    try { if (session) await request('/auth/v1/logout', { method: 'POST', token: session.access_token }); }
    finally { session = null; }
  }

  const safeImage = value => typeof value === 'string' && (/^assets\/[a-z0-9_./-]+$/i.test(value) || /^https:\/\/[^\s"<>]+$/i.test(value)) ? value : 'assets/placeholder.svg';
  function normalizeProduct(row) {
    return { ...row, id: Number(row.id), precio: Number(row.precio), stock: Number(row.stock), imagen: safeImage(row.imagen) };
  }
  function validateProduct(product) {
    if (typeof product.nombre !== 'string' || !product.nombre.trim() || product.nombre.length > 100) throw new Error('Ingresá un nombre de hasta 100 caracteres.');
    if (!['Collares', 'Aros', 'Anillos', 'Pulseras'].includes(product.categoria)) throw new Error('Elegí una categoría válida.');
    if (!Number.isFinite(product.precio) || product.precio <= 0 || product.precio > 99999999 || Math.abs(product.precio * 100 - Math.round(product.precio * 100)) > 0.00001) throw new Error('Ingresá un precio válido, con hasta dos decimales.');
    if (!Number.isInteger(product.stock) || product.stock < 0 || product.stock > 99999) throw new Error('El stock debe ser un entero entre 0 y 99999.');
    if ((product.descripcion || '').length > 2000) throw new Error('La descripción admite hasta 2000 caracteres.');
    if (!['', 'Nuevo', 'Más vendido'].includes(product.badge || '')) throw new Error('Elegí una etiqueta válida.');
    return { nombre: product.nombre.trim(), categoria: product.categoria, precio: product.precio,
      stock: product.stock, descripcion: product.descripcion || '', imagen: safeImage(product.imagen),
      destacado: Boolean(product.destacado), nuevo: Boolean(product.nuevo), activo: Boolean(product.activo), badge: product.badge || '' };
  }
  async function listProducts(admin = false) {
    const token = admin ? await accessToken() : undefined;
    const rows = [];
    // Paginación explícita para no truncar el catálogo al límite de filas del API.
    for (let offset = 0; ; offset += 500) {
      const page = await request(`/rest/v1/products?select=*&order=id.asc&limit=500&offset=${offset}${admin ? '' : '&activo=eq.true'}`, { token });
      if (!Array.isArray(page)) throw new Error('La respuesta del catálogo no es válida.');
      rows.push(...page.map(normalizeProduct));
      if (page.length < 500) break;
    }
    return rows;
  }
  async function saveProduct(product, original) {
    const body = validateProduct(product);
    const filter = original ? `?id=eq.${original.id}&updated_at=eq.${encodeURIComponent(original.updated_at)}` : '';
    const result = await request('/rest/v1/products' + filter, { method: original ? 'PATCH' : 'POST', body,
      token: await accessToken(), headers: { Prefer: 'return=representation' } });
    if (!result?.length) throw new Error('Otra persona modificó este producto. Cerrá el editor y actualizá la lista antes de volver a editarlo.');
    return normalizeProduct(result[0]);
  }
  async function uploadImage(file) {
    const types = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
    if (!types[file.type] || file.size > 5 * 1024 * 1024 || file.size === 0) throw new Error('Elegí una imagen JPG, PNG o WebP de hasta 5 MB.');
    const path = `products/${crypto.randomUUID()}.${types[file.type]}`;
    await request('/storage/v1/object/product-images/' + path, { method: 'POST', body: file, token: await accessToken(), headers: { 'Content-Type': file.type, 'x-upsert': 'false' } });
    return url + '/storage/v1/object/public/product-images/' + path;
  }
  function demoProducts() {
    const stored = localStorage.getItem(demoKey);
    if (stored) {
      const parsed = JSON.parse(stored);
      if (!Array.isArray(parsed)) throw new Error('Los datos de prueba no son válidos.');
      const ids = new Set();
      return parsed.map(row => {
        if (!row || !Number.isSafeInteger(row.id) || row.id <= 0 || ids.has(row.id)) throw new Error('Identificador de prueba no válido.');
        ids.add(row.id);
        return { ...validateProduct(row), id: row.id, updated_at: row.updated_at };
      });
    }
    return window.COQUETTE_PRODUCTS.map(product => ({ ...product, stock: 10, activo: true, descripcion: '', updated_at: new Date().toISOString() }));
  }
  window.CoquetteData = Object.freeze({ configured, login, logout, listProducts, saveProduct, uploadImage,
    safeImage, validateProduct, demoProducts, saveDemo: rows => localStorage.setItem(demoKey, JSON.stringify(rows)) });
})();
