# Coquette Accessory

Tienda con HTML, CSS y JavaScript vanilla. Abrí `index.html` para ver la tienda y `admin.html` para probar el panel. Para desarrollo, ejecutar `node tests/server.cjs` y abrir `http://127.0.0.1:8080`. La web no requiere compilación ni dependencias de ejecución.

## Panel de administración

El panel permite crear y editar productos, fotos, precios, descripciones, stock y visibilidad. Sin configuración ofrece una demo local aislada de la tienda. Con Supabase usa cuentas autorizadas y publica los cambios en la base de datos.

**Guía de conexión y uso:** [ADMINISTRACION.md](ADMINISTRACION.md). El servicio externo todavía debe crearse y configurarse en una cuenta propia.

## Archivos

- `index.html`: estructura, navegación, secciones y diálogos.
- `css/styles.css`: diseño responsive, colores y tipografías en variables CSS.
- `js/products.js`: catálogo de demostración editable.
- `js/app.js`: filtros, búsqueda, carrito y WhatsApp.
- `admin.html`, `css/admin.css`, `js/admin.js`: panel de administración.
- `js/config.js`: URL y clave pública de Supabase, número de WhatsApp.
- `js/data.js`: acceso a datos, autenticación, fotos y validaciones.
- `supabase/schema.sql`: tablas y permisos de acceso a datos y fotos.
- `assets/`: ilustraciones SVG locales de demostración; funcionan sin servicios externos.

## Antes de publicar

1. **Logo oficial:** no se recibieron archivos adjuntos en el workspace. Reemplazar las dos marcas tipográficas `.wordmark` del HTML con el logo oficial y su texto alternativo. El favicon también es provisorio.
2. **Referencia visual:** tampoco estuvo disponible. La composición actual es original, basada en la descripción editorial/minimalista solicitada.
3. **Fotografías:** reemplazar las ilustraciones SVG por fotos reales. Guardar fotos de productos en `assets/productos/` y actualizar `imagen` en `js/products.js`. Reemplazar también las imágenes del hero, banner e Instagram en `index.html`. Actualizar los textos alternativos. Las ilustraciones actuales no representan artículos reales.
4. **Catálogo:** conectar Supabase siguiendo la guía de administración y cargar los productos reales desde el panel. Al conectarlo, la tienda deja de usar `js/products.js` y oculta automáticamente los avisos de catálogo de demostración. Las ilustraciones editoriales siguen siendo provisorias.
5. **WhatsApp:** completar `whatsappNumber` en `js/config.js` con el número internacional, solo dígitos. Vacío, muestra un aviso y no envía pedidos a un contacto inventado.
6. **Contacto:** Instagram ya apunta a `https://www.instagram.com/coquette_accesory/`. Agregar otros datos de contacto únicamente cuando estén confirmados.

## Comportamiento

El carrito guarda IDs y cantidades en `localStorage`, permite 1 a 99 unidades por producto, limitado por el stock real, y se sincroniza entre pestañas. Si el almacenamiento está bloqueado, funciona durante la sesión y avisa que no puede persistir. Datos guardados inválidos se descartan. Los carritos demo y real están separados. Antes de preparar un pedido real se verifican precios y disponibilidad. El pedido se prepara en WhatsApp; no se envía automáticamente ni procesa pagos o reserva unidades. El subtotal excluye envío, a confirmar con la marca.

El icono de usuario explica cómo comprar sin cuenta. El acceso privado de administración está en `admin.html`. Los diálogos nativos permiten cerrar con Escape y mantienen el foco dentro del panel. Se respetan las preferencias de movimiento reducido. No se cargan bibliotecas ni fuentes externas; al configurar Supabase, los productos y sus fotos se obtienen del servicio.

## Pruebas

- `node --test tests/data.test.cjs`: pruebas de validación y API con respuestas simuladas.
- `npm install` y `npx playwright test`: pruebas de navegador con Chrome instalado. Playwright es solo una dependencia de desarrollo.
- La autorización SQL debe verificarse también en el proyecto Supabase real siguiendo `ADMINISTRACION.md`.

## Revisión manual

- Revisar la página a 375, 768 y 1440 px; abrir/cerrar el menú móvil.
- Filtrar categorías/novedades, buscar por nombre con y sin acentos y probar una búsqueda sin resultados.
- Agregar productos, cambiar cantidades, eliminar y recargar para verificar persistencia.
- Abrir/cerrar diálogos con teclado y Escape.
- Configurar un número de prueba propio y revisar cantidades y total en el mensaje de WhatsApp antes de enviarlo.
