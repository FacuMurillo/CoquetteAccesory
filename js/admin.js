(() => {
  'use strict';
  const api = window.CoquetteData;
  const $ = selector => document.querySelector(selector);
  const escape = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const money = value => new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(value);
  let rows = [], demo = false, editing = null, photo = null, previewUrl = '', busy = false, dirty = false;
  const demoPhotos = new Map();
  const status = message => { $('#admin-status').textContent = message; };

  function render() {
    $('#stat-total').textContent = rows.length;
    $('#stat-active').textContent = rows.filter(p => p.activo).length;
    $('#stat-empty').textContent = rows.filter(p => p.stock === 0).length;
    const query = $('#admin-search').value.toLocaleLowerCase('es').trim();
    const filter = $('#admin-filter').value;
    const visible = rows.filter(p => `${p.nombre} ${p.categoria}`.toLocaleLowerCase('es').includes(query) &&
      (filter === 'all' || filter === 'active' && p.activo || filter === 'hidden' && !p.activo || filter === 'empty' && p.stock === 0));
    $('#admin-products').innerHTML = visible.map(p => `<article class="admin-product"><img src="${escape(demoPhotos.get(p.id) || api.safeImage(p.imagen))}" alt="${escape(p.nombre)}"><div><h2>${escape(p.nombre)}</h2><p>${escape(p.categoria)}</p><span class="product-state ${p.activo ? '' : 'hidden-state'}">${p.activo ? 'Publicado' : 'Oculto'}</span></div><span class="admin-price">${money(p.precio)}</span><span class="stock-label">Stock<strong>${p.stock === 0 ? 'Agotado' : p.stock + ' unidades'}</strong></span><button class="secondary" data-edit="${p.id}" aria-label="Editar ${escape(p.nombre)}">Editar</button></article>`).join('');
    $('#admin-empty').hidden = visible.length > 0;
  }
  async function load() {
    $('#refresh').disabled = true;
    try { rows = demo ? api.demoProducts() : await api.listProducts(true); render(); }
    finally { $('#refresh').disabled = false; }
  }
  async function enter() {
    await load();
    $('#login-section').hidden = true;
    $('#dashboard').hidden = false;
    $('#logout').hidden = false;
    $('#demo-banner').hidden = !demo;
    status('');
    $('#new-product').focus();
  }
  function setBusy(value) {
    busy = value;
    $('#editor-fields').disabled = value;
    $('#save-product').disabled = value;
    $('#editor-cancel').disabled = value;
    $('#editor-close').disabled = value;
    $('#save-product').textContent = value ? 'Guardando…' : 'Guardar producto ↗';
  }
  function openEditor(product = null) {
    editing = product;
    photo = null;
    dirty = false;
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    previewUrl = '';
    $('#product-form').reset();
    $('#editor-title').textContent = product ? 'Editar producto' : 'Nuevo producto';
    $('#product-name').value = product?.nombre || '';
    $('#product-category').value = product?.categoria || 'Collares';
    $('#product-price').value = product?.precio || '';
    $('#product-stock').value = product?.stock ?? 0;
    $('#product-description').value = product?.descripcion || '';
    $('#product-badge').value = product?.badge || '';
    $('#product-active').checked = product?.activo ?? false;
    $('#product-featured').checked = product?.destacado ?? false;
    $('#product-new').checked = product?.nuevo ?? false;
    $('#image-preview').src = demoPhotos.get(product?.id) || api.safeImage(product?.imagen);
    $('#editor-status').textContent = '';
    $('#product-dialog').showModal();
    document.body.classList.add('modal-open');
    $('#product-name').focus();
  }
  function closeEditor() {
    if (busy) return;
    if (dirty && !window.confirm('¿Descartar los cambios sin guardar?')) return;
    $('#product-dialog').close();
  }
  $('#product-dialog').addEventListener('close', () => {
    document.body.classList.remove('modal-open');
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    previewUrl = '';
    photo = null;
    const button = editing ? document.querySelector(`[data-edit="${editing.id}"]`) : $('#new-product');
    button?.focus();
  });
  $('#product-dialog').addEventListener('cancel', event => { event.preventDefault(); closeEditor(); });
  $('#editor-close').addEventListener('click', closeEditor);
  $('#editor-cancel').addEventListener('click', closeEditor);
  $('#product-form').addEventListener('input', () => { dirty = true; });
  $('#product-image').addEventListener('change', async () => {
    photo = null;
    const file = $('#product-image').files[0];
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    previewUrl = '';
    $('#image-preview').src = demoPhotos.get(editing?.id) || api.safeImage(editing?.imagen);
    if (!file) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 5242880 || !file.size) {
      $('#editor-status').textContent = 'Elegí una imagen JPG, PNG o WebP de hasta 5 MB.';
      $('#product-image').value = '';
      return;
    }
    photo = file;
    previewUrl = URL.createObjectURL(file);
    $('#image-preview').src = previewUrl;
    $('#editor-status').textContent = '';
  });
  $('#product-form').addEventListener('submit', async event => {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    $('#editor-status').textContent = '';
    try {
      const product = api.validateProduct({ nombre: $('#product-name').value.trim(), categoria: $('#product-category').value,
        precio: Number($('#product-price').value), stock: Number($('#product-stock').value),
        descripcion: $('#product-description').value.trim(), badge: $('#product-badge').value,
        activo: $('#product-active').checked, destacado: $('#product-featured').checked, nuevo: $('#product-new').checked,
        imagen: editing?.imagen || 'assets/placeholder.svg' });
      let saved;
      if (demo) {
        saved = { ...product, id: editing?.id ?? Math.max(0, ...rows.map(row => row.id)) + 1, updated_at: new Date().toISOString() };
        const next = editing ? rows.map(p => p.id === editing.id ? saved : p) : [...rows, saved];
        api.saveDemo(next); // Solo cambiar el estado visible si la escritura fue exitosa.
        if (photo) {
          const previous = demoPhotos.get(saved.id);
          if (previous) URL.revokeObjectURL(previous);
          demoPhotos.set(saved.id, URL.createObjectURL(photo));
        }
      } else {
        if (photo) {
          product.imagen = await api.uploadImage(photo);
          // Guardar la URL para reintentar sin subir la misma foto si falla la escritura.
          photo = null;
          if (editing) editing = { ...editing, imagen: product.imagen };
          else pendingImage = product.imagen;
        } else if (!editing && pendingImage) product.imagen = pendingImage;
        saved = await api.saveProduct(product, editing);
      }
      rows = editing ? rows.map(p => p.id === saved.id ? saved : p) : [...rows, saved];
      render();
      dirty = false;
      $('#product-dialog').close();
      status(demo ? 'Producto guardado en la demo de este navegador.' : 'Producto guardado. El cambio aparece al actualizar la tienda.');
    } catch (error) { $('#editor-status').textContent = error.message || 'No se pudo guardar. Volvé a intentarlo.'; }
    finally { setBusy(false); }
  });
  let pendingImage = '';
  $('#new-product').addEventListener('click', () => { pendingImage = ''; openEditor(); });
  $('#admin-products').addEventListener('click', event => {
    const button = event.target.closest('[data-edit]');
    if (button) { pendingImage = ''; openEditor(rows.find(p => p.id === Number(button.dataset.edit))); }
  });
  $('#admin-search').addEventListener('input', render);
  $('#admin-filter').addEventListener('change', render);
  $('#refresh').addEventListener('click', () => load().then(() => status('Lista actualizada.')).catch(error => status(error.message)));
  $('#login-form').addEventListener('submit', async event => {
    event.preventDefault();
    const button = $('#login-form button');
    button.disabled = true;
    status('Ingresando…');
    try { await api.login($('#email').value.trim(), $('#password').value); demo = false; await enter(); }
    catch (error) { status(error.message); }
    finally { $('#password').value = ''; button.disabled = false; }
  });
  $('#open-demo').addEventListener('click', async () => {
    demo = true;
    try { await enter(); } catch { status('No se puede abrir la demo. Habilitá el almacenamiento local del navegador o eliminá la clave coquette.admin.demo.v1 si está dañada.'); }
  });
  $('#logout').addEventListener('click', async () => {
    $('#logout').disabled = true;
    let message = '';
    try { if (!demo) await api.logout(); }
    catch { message = 'Sesión cerrada en este navegador. No se pudo confirmar la revocación en el servidor.'; }
    finally {
      rows = []; render();
      for (const photoUrl of demoPhotos.values()) URL.revokeObjectURL(photoUrl);
      demoPhotos.clear();
      $('#dashboard').hidden = true;
      $('#logout').hidden = true;
      $('#logout').disabled = false;
      $('#login-section').hidden = false;
      status(message);
      (api.configured ? $('#email') : $('#open-demo')).focus();
    }
  });
  document.addEventListener('error', event => {
    if (event.target.tagName === 'IMG' && !event.target.src.endsWith('/assets/placeholder.svg')) event.target.src = 'assets/placeholder.svg';
  }, true);
  window.addEventListener('beforeunload', event => { if (dirty || busy) { event.preventDefault(); event.returnValue = ''; } });
  $('#login-form').hidden = !api.configured;
  $('#setup-info').hidden = api.configured;
})();
