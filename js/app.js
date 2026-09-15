'use strict';

// Número internacional, solo dígitos, sin + ni espacios. Ejemplo argentino: 549 + área + número.
const WHATSAPP_NUMBER = window.COQUETTE_CONFIG.whatsappNumber;
const liveCatalog = window.CoquetteData.configured;
const STORAGE_KEY = liveCatalog ? 'coquette.cart.live.v1' : 'coquette.cart.v1';
let products = liveCatalog ? [] : window.COQUETTE_PRODUCTS.map(product => ({ ...product, stock: 99 }));
let catalogReady = !liveCatalog;
const stockLimit = product => Math.min(99, Math.max(0, product.stock));
const categories = ['Collares', 'Aros', 'Anillos', 'Pulseras'];
const money = value => new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(value);
const $ = selector => document.querySelector(selector);
const escapeHtml = value => String(value).replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
let cart = [];
let selectedCategory = 'Destacados';
let searchTerm = '';
let toastTimer;
let storageAvailable = true;
let cartRevision = 0;
let checkingOrder = false;

function readCart() {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    if (!Array.isArray(stored)) return [];
    const valid = new Map();
    stored.forEach(item => {
      const product = item && products.find(product => product.id === item.id);
      if (product && stockLimit(product) > 0 && Number.isInteger(item.cantidad) && item.cantidad > 0) {
        valid.set(item.id, { id: item.id, cantidad: Math.min(stockLimit(product), item.cantidad) });
      }
    });
    return [...valid.values()];
  } catch { return []; }
}

function notify(message) {
  clearTimeout(toastTimer);
  $('#toast').textContent = message;
  $('#toast').classList.add('visible');
  toastTimer = setTimeout(() => $('#toast').classList.remove('visible'), 3500);
}

function saveCart() {
  cartRevision += 1;
  $('#whatsapp-status').hidden = true;
  $('#whatsapp-status').textContent = '';
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(cart)); }
  catch {
    storageAvailable = false;
    notify('Tu navegador no permite guardar el carrito. Se conservará mientras esta página siga abierta.');
  }
  renderCart();
}

function renderProducts() {
  const normalize = text => text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const visible = products.filter(product => {
    const matchCategory = selectedCategory === 'Todos' || (selectedCategory === 'Destacados' ? product.destacado : selectedCategory === 'Novedades' ? product.nuevo : product.categoria === selectedCategory);
    return matchCategory && normalize(`${product.nombre} ${product.categoria}`).includes(normalize(searchTerm));
  });
  $('#collection-title').textContent = searchTerm ? `Resultados para “${searchTerm}”` : selectedCategory === 'Destacados' ? 'Tus próximos favoritos' : selectedCategory === 'Todos' ? 'La colección Coquette' : selectedCategory;
  $('#product-grid').innerHTML = visible.map(product => `<article class="product-card"><div class="product-visual"><img src="${escapeHtml(product.imagen)}" alt="${escapeHtml(product.nombre)}${liveCatalog ? '' : ' — ilustración de demostración'}" width="600" height="750" loading="lazy">${product.stock === 0 || product.badge ? `<span class="badge">${product.stock === 0 ? 'Agotado' : escapeHtml(product.badge)}</span>` : ''}</div><p class="product-category">${escapeHtml(product.categoria)}</p><h3>${escapeHtml(product.nombre)}</h3>${product.descripcion ? `<p class="product-description">${escapeHtml(product.descripcion)}</p>` : ''}<p class="product-price">${money(product.precio)}</p><button class="add-button" data-add="${product.id}" aria-label="Agregar ${escapeHtml(product.nombre)} al carrito" ${product.stock === 0 ? 'disabled' : ''}>${product.stock === 0 ? 'Agotado' : 'Agregar al carrito <span aria-hidden="true">+</span>'}</button></article>`).join('');
  $('#empty-results').hidden = visible.length > 0;
  document.querySelectorAll('[data-filter]').forEach(button => button.setAttribute('aria-pressed', button.dataset.filter === selectedCategory));
}

function selectCategory(category) {
  selectedCategory = category;
  searchTerm = '';
  $('#search').value = '';
  renderProducts();
}

function renderCart() {
  const count = cart.reduce((total, item) => total + item.cantidad, 0);
  const subtotal = cart.reduce((total, item) => total + products.find(product => product.id === item.id).precio * item.cantidad, 0);
  $('#cart-count').textContent = count;
  $('#cart-toggle').setAttribute('aria-label', `Abrir carrito, ${count} productos`);
  $('#cart-subtotal').textContent = money(subtotal);
  $('#checkout').disabled = count === 0 || !catalogReady || checkingOrder;
  $('#cart-items').innerHTML = cart.length ? cart.map(item => {
    const product = products.find(product => product.id === item.id);
    return `<article class="cart-item"><img src="${escapeHtml(product.imagen)}" alt="${escapeHtml(product.nombre)}"><div><h3>${escapeHtml(product.nombre)}</h3><p>${money(product.precio)} c/u · ${money(product.precio * item.cantidad)}</p><div class="quantity-controls"><button data-change="-1" data-id="${item.id}" aria-label="Restar una unidad de ${escapeHtml(product.nombre)}" ${item.cantidad === 1 ? 'disabled' : ''}>−</button><span aria-label="Cantidad">${item.cantidad}</span><button data-change="1" data-id="${item.id}" aria-label="Sumar una unidad de ${escapeHtml(product.nombre)}" ${item.cantidad >= stockLimit(product) ? 'disabled' : ''}>+</button><button class="remove-item" data-remove="${item.id}" aria-label="Eliminar ${escapeHtml(product.nombre)}">Eliminar</button></div></div></article>`;
  }).join('') : '<div class="cart-empty"><span class="signature">Un pequeño flechazo…</span><h3>Tu carrito está esperando.</h3><p>Explorá la colección y encontrá tus favoritos.</p><button class="button" id="continue-shopping">Ver colección ↗</button></div>';
}

function openDialog(dialog) { dialog.showModal(); document.body.classList.add('modal-open'); }
[$('#cart-dialog'), $('#info-dialog')].forEach(dialog => {
  dialog.addEventListener('close', () => document.body.classList.remove('modal-open'));
  dialog.addEventListener('click', event => {
    const bounds = dialog.getBoundingClientRect();
    if (event.target === dialog && (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom)) dialog.close();
  });
});

function sendWhatsApp(message) {
  if (!/^\d{8,15}$/.test(WHATSAPP_NUMBER)) {
    if ($('#cart-dialog').open) {
      $('#whatsapp-status').hidden = false;
      $('#whatsapp-status').textContent = 'WhatsApp todavía no está configurado. Podés consultar por Instagram.';
    }
    else openDialog($('#info-dialog'));
    notify('WhatsApp aún no está configurado. Contactanos por Instagram.');
    return;
  }
  window.open(`https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`, '_blank', 'noopener,noreferrer');
}

function renderCategories() {
$('#category-grid').innerHTML = categories.map(category => {
  const product = products.find(item => item.categoria === category);
  return `<a class="category-card" href="#coleccion" data-category="${category}" aria-label="Ver productos: ${category}"><img src="${escapeHtml(product?.imagen || 'assets/placeholder.svg')}" alt="${category}" width="600" height="800" loading="lazy"><div class="category-copy"><h3>${category}</h3><span>Ver productos ↗</span></div></a>`;
}).join('');
}
$('#filters').innerHTML = ['Destacados', 'Todos', ...categories, 'Novedades'].map(category => `<button class="filter" data-filter="${category}" aria-pressed="false">${category}</button>`).join('');

document.addEventListener('click', event => {
  const categoryLink = event.target.closest('[data-category]');
  if (categoryLink) selectCategory(categoryLink.dataset.category);
  const filter = event.target.closest('[data-filter]');
  if (filter) selectCategory(filter.dataset.filter);
  const add = event.target.closest('[data-add]');
  if (add) {
    const id = Number(add.dataset.add);
    const product = products.find(product => product.id === id);
    if (!catalogReady || !product || stockLimit(product) === 0) return;
    const existing = cart.find(item => item.id === id);
    if ((existing?.cantidad || 0) >= stockLimit(product)) return notify('Llegaste al máximo disponible de este producto.');
    if (existing) existing.cantidad += 1;
    else cart.push({ id, cantidad: 1 });
    saveCart();
    if (storageAvailable) notify(`${products.find(product => product.id === id).nombre} se agregó a tu carrito ♡`);
  }
});

$('#cart-items').addEventListener('click', event => {
  const change = event.target.closest('[data-change]');
  const remove = event.target.closest('[data-remove]');
  if (change) {
    const item = cart.find(entry => entry.id === Number(change.dataset.id));
    item.cantidad = Math.max(1, Math.min(stockLimit(products.find(product => product.id === item.id)), item.cantidad + Number(change.dataset.change)));
    const selector = `[data-id="${item.id}"][data-change="${change.dataset.change}"]`;
    saveCart();
    const next = $(selector);
    if (next.disabled) next.parentElement.querySelector('button:not(:disabled)').focus();
    else next.focus();
  }
  if (remove) {
    cart = cart.filter(item => item.id !== Number(remove.dataset.remove));
    saveCart();
    ($('#cart-items button') || $('#cart-close')).focus();
  }
  if (event.target.closest('#continue-shopping')) {
    $('#cart-dialog').close();
    document.getElementById('coleccion').scrollIntoView();
  }
});
$('#cart-toggle').addEventListener('click', () => openDialog($('#cart-dialog')));
$('#cart-close').addEventListener('click', () => $('#cart-dialog').close());
$('#account-toggle').addEventListener('click', () => openDialog($('#info-dialog')));
$('#info-close').addEventListener('click', () => $('#info-dialog').close());
$('#menu-toggle').addEventListener('click', () => {
  const expanded = $('#menu-toggle').getAttribute('aria-expanded') !== 'true';
  $('#menu-toggle').setAttribute('aria-expanded', expanded);
  $('#menu-toggle').setAttribute('aria-label', expanded ? 'Cerrar menú' : 'Abrir menú');
  $('#navigation').classList.toggle('is-open', expanded);
});
$('#navigation').addEventListener('click', event => {
  if (!event.target.closest('a')) return;
  $('#navigation').classList.remove('is-open');
  $('#menu-toggle').setAttribute('aria-expanded', 'false');
  $('#menu-toggle').setAttribute('aria-label', 'Abrir menú');
});
$('#search-toggle').addEventListener('click', () => {
  $('#search-form').hidden = !$('#search-form').hidden;
  $('#search-toggle').setAttribute('aria-expanded', !$('#search-form').hidden);
  if (!$('#search-form').hidden) $('#search').focus();
});
$('#search-form').addEventListener('submit', event => {
  event.preventDefault();
  searchTerm = $('#search').value.trim();
  selectedCategory = 'Todos';
  renderProducts();
  $('#coleccion').scrollIntoView();
});
$('#show-all').addEventListener('click', () => selectCategory('Todos'));
$('#checkout').addEventListener('click', async () => {
  if (!cart.length || !catalogReady || checkingOrder) return;
  // Revalidar precios y stock antes de preparar el mensaje. No reserva unidades.
  if (liveCatalog) {
    checkingOrder = true;
    const revision = cartRevision;
    $('#checkout').disabled = true;
    $('#whatsapp-status').hidden = false;
    $('#whatsapp-status').textContent = 'Verificando precios y disponibilidad…';
    try {
      const before = JSON.stringify(cart.map(item => ({ ...item, precio: products.find(p => p.id === item.id).precio })));
      const currentCart = cart.map(item => ({ ...item }));
      const latestProducts = await window.CoquetteData.listProducts();
      if (revision !== cartRevision) {
        $('#whatsapp-status').hidden = false;
        $('#whatsapp-status').textContent = 'Tu selección cambió durante la verificación. Volvé a finalizar el pedido.';
        return;
      }
      products = latestProducts;
      cart = currentCart.flatMap(item => {
        const product = products.find(p => p.id === item.id);
        return product && stockLimit(product) > 0 ? [{ id: item.id, cantidad: Math.min(item.cantidad, stockLimit(product)) }] : [];
      });
      saveCart(); renderProducts(); renderCategories();
      $('#whatsapp-status').hidden = false;
      const after = JSON.stringify(cart.map(item => ({ ...item, precio: products.find(p => p.id === item.id).precio })));
      if (before !== after) {
        $('#whatsapp-status').textContent = 'Cambió el precio o la disponibilidad de tu selección. Revisá el carrito y volvé a finalizar el pedido.';
        return;
      }
      // Enlace explícito para evitar bloqueos de ventanas después de una solicitud de red.
      $('#whatsapp-status').textContent = '';
      const link = document.createElement('a');
      if (!/^\d{8,15}$/.test(WHATSAPP_NUMBER)) {
        $('#whatsapp-status').textContent = 'WhatsApp todavía no está configurado. Podés consultar por Instagram.';
        return;
      }
      link.href = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(orderMessage())}`;
      link.target = '_blank'; link.rel = 'noopener noreferrer'; link.className = 'text-link';
      link.textContent = 'Abrir pedido en WhatsApp ↗';
      $('#whatsapp-status').append(link);
      return;
    } catch { $('#whatsapp-status').hidden = false; $('#whatsapp-status').textContent = 'No pudimos verificar el catálogo. Volvé a intentar antes de enviar el pedido.'; return; }
    finally { checkingOrder = false; $('#checkout').disabled = cart.length === 0; }
  }
  sendWhatsApp(orderMessage());
});
function orderMessage() {
  const lines = cart.map(item => {
    const product = products.find(entry => entry.id === item.id);
    return `• ${product.nombre} × ${item.cantidad} — ${money(product.precio * item.cantidad)}`;
  });
  const total = cart.reduce((sum, item) => sum + products.find(entry => entry.id === item.id).precio * item.cantidad, 0);
  return `¡Hola Coquette! Me gustaría consultar por este pedido:\n\n${lines.join('\n')}\n\nTotal de productos: ${money(total)}\n\n¿Me confirman disponibilidad, medios de pago y costo de envío?${liveCatalog ? '' : '\n(Catálogo de demostración)'}`;
}
$('#contact-whatsapp').addEventListener('click', () => sendWhatsApp('¡Hola Coquette! Quisiera consultar por sus accesorios.'));
window.addEventListener('storage', event => { if (catalogReady && (event.key === STORAGE_KEY || event.key === null)) { cartRevision += 1; $('#whatsapp-status').hidden = true; $('#whatsapp-status').textContent = ''; cart = readCart(); renderCart(); } });
document.addEventListener('error', event => {
  if (event.target.tagName === 'IMG' && !event.target.src.endsWith('/assets/placeholder.svg')) event.target.src = 'assets/placeholder.svg';
}, true);
$('#year').textContent = new Date().getFullYear();
async function initializeCatalog() {
  renderCategories();
  renderCart();
  if (liveCatalog) {
    const note = document.querySelector('#coleccion .demo-note');
    note.textContent = 'Cargando colección…';
    document.querySelector('.cart-summary .demo-note').hidden = true;
    try {
      products = await window.CoquetteData.listProducts();
      catalogReady = true;
      selectedCategory = products.some(product => product.destacado) ? 'Destacados' : 'Todos';
      note.textContent = products.length ? '' : 'Pronto vas a encontrar nuestra colección acá.';
    } catch {
      note.textContent = 'No pudimos cargar la colección. ';
      const retry = document.createElement('button');
      retry.className = 'add-button'; retry.textContent = 'Reintentar';
      retry.addEventListener('click', initializeCatalog);
      note.append(retry);
      return;
    }
  }
  cart = readCart();
  renderCategories(); renderProducts(); renderCart();
}
initializeCatalog();
