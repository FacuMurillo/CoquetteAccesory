# Administrar Coquette Accessory

## Probar ahora

Abrí `admin.html` y elegí **Probar el panel**. Podés crear productos, editar precios y stock, filtrar y ocultar artículos. La demo guarda datos únicamente en este navegador; no cambia el catálogo de la tienda. Sus fotos son vistas previas temporales hasta recargar. No hay contraseña de prueba ni acceso real a una base de datos.

## Conectar la tienda real: una sola vez

La integración está implementada, pero hace falta crear el proyecto en una cuenta propia. No se creó ningún servicio externo ni se publicó la página desde este workspace.

1. Crear una cuenta y un proyecto **Free** en [Supabase](https://supabase.com/dashboard). Elegir una contraseña robusta para la base de datos y guardarla fuera del código.
2. En **SQL Editor**, ejecutar todo `supabase/schema.sql` una sola vez, en un proyecto nuevo. Crea el catálogo vacío, la lista privada de administradores y el almacenamiento de fotos. No importa los productos de ejemplo.
3. En **Authentication → Users**, crear la cuenta de tu hermana con email y contraseña (confirmar el email desde la consola si usás creación manual). Entregarle la contraseña por un canal privado; puede cambiarla/restablecerla desde el mecanismo que gestione el propietario del proyecto. Este panel no implementa recuperación por email.
4. Copiar el UUID de esa cuenta. En SQL Editor ejecutar, reemplazando el ejemplo:

   ```sql
   insert into public.admin_users(user_id)
   values ('UUID-DE-LA-CUENTA');
   ```

5. Desactivar nuevos registros públicos en la configuración de Auth. Aunque se habilitaran, una cuenta nueva no tiene permisos de administración: solo los UUID agregados por SQL pueden editar.
6. En la configuración del proyecto, obtener **Project URL** y **Publishable key** (también se admite la antigua `anon` key). Completar `js/config.js`:

   ```js
   window.COQUETTE_CONFIG = Object.freeze({
     supabaseUrl: 'https://TU-PROYECTO.supabase.co',
     supabaseKey: 'sb_publishable_REEMPLAZAR',
     whatsappNumber: 'NUMERO_INTERNACIONAL_SOLO_DIGITOS'
   });
   ```

   Esos dos datos de Supabase son públicos por diseño. **Nunca usar `service_role`, `sb_secret_`, la contraseña de la base de datos ni la contraseña de tu hermana en archivos del sitio.** La seguridad de las escrituras depende de las políticas SQL, no de ocultar la URL del panel.

7. Publicar los archivos estáticos, incluyendo `admin.html`, `css/`, `js/` y `assets/`. No requiere build, framework ni servidor Node en producción. Entrar en `https://TU-DOMINIO/admin.html` e iniciar sesión. No hace falta redeploy para cada producto: los cambios se leen de Supabase al cargar la tienda.
8. Crear un producto de prueba, cargar una foto y marcarlo como publicado. Revisar en otra ventana sin sesión que aparece en el catálogo. Ocultarlo y comprobar que desaparece. Eliminar luego sus datos desde la consola si corresponde.

## Uso diario para tu hermana

- **Nuevo producto:** completar nombre, categoría, precio en pesos y stock. Agregar una foto y, si corresponde, descripción, etiqueta, destacado o novedad. Marcar “Publicar en la tienda” y guardar.
- **Cambiar precio o stock:** buscar el producto, tocar “Editar”, cambiar el dato y guardar.
- **Ocultar:** desmarcar “Publicar en la tienda”. Sigue disponible en el panel para volver a publicarlo. No se borra permanentemente.
- **Agotado:** stock 0. Se muestra en la tienda, pero no se puede agregar al carrito.
- **Venta por WhatsApp:** confirmar pago y entrega por mensaje y descontar manualmente las unidades vendidas. El carrito no reserva ni descuenta stock; no se registran ventas/pagos en la base de datos.
- **Sesión:** cerrar sesión al terminar. Por diseño, recargar el panel pide iniciar sesión de nuevo. Los tokens se mantienen solo en memoria y se renuevan mientras se utiliza el panel.
- **Ediciones simultáneas:** si alguien cambió el producto después de abrirlo, el panel rechaza la versión vieja. Cerrá el editor, actualizá la lista y repetí el cambio.

## Fotos y disponibilidad

Se aceptan JPG, PNG y WebP de hasta 5 MB. Conviene subir fotos optimizadas (por ejemplo 1200 px de lado y menos de 500 KB). Cada carga crea un archivo único; las imágenes anteriores se conservan para no romper referencias. Si una escritura falla después de subir la foto, puede quedar un archivo sin usar: revisar y limpiar desde Storage periódicamente. No borrar fotos que sigan vinculadas a productos.

El bucket de fotos es público, incluso si un producto está oculto; no subir documentos privados. La demo no sube archivos. Logo, portada y banner siguen editándose en los archivos de la web.

Al conectar Supabase, el catálogo de ejemplo deja de aparecer. Una base vacía muestra una colección vacía. Un error de conexión muestra un aviso con opción de reintentar, sin reemplazar productos reales por ejemplos. Los carritos reales usan una clave distinta a la demo para no mezclar IDs.

Antes de preparar el pedido se revalidan precio y stock. Si cambiaron, se pide revisar el carrito. Si están vigentes, aparece “Abrir pedido en WhatsApp”. El envío sigue sujeto a confirmación de la marca.

## Costos y publicación

Verificado el 15/09/2026: [Supabase Free](https://supabase.com/pricing) incluye 500 MB de base de datos y 1 GB de archivos; pausa proyectos tras una semana de inactividad. Tiene límites de transferencia y no incluye backups automáticos del plan pago. Exportar el catálogo y conservar originales de las fotos como respaldo.

[Vercel Hobby](https://vercel.com/docs/plans/hobby) está restringido a uso personal no comercial. Para esta tienda, usar un plan que permita actividad comercial o evaluar otro alojamiento. El código es estático y no depende de Vercel.

## Verificación técnica

`node --test tests/*.test.cjs` comprueba validaciones, acceso HTTP, permisos de sesión del cliente, conflictos de edición y comportamiento del carrito con servicios simulados. No sustituye las pruebas contra un proyecto real.

Antes de publicar, comprobar contra Supabase:

- Usuario anónimo: puede leer solo artículos activos; no puede crear, editar ni subir fotos.
- Cuenta autenticada sin entrada en `admin_users`: no puede editar, cargar fotos ni autoasignarse permisos.
- Administradora: puede leer ocultos, crear, editar y subir JPG/PNG/WebP.
- Cambiar un producto desde dos sesiones y verificar que la segunda escritura desactualizada falla.
- Probar carga/edición desde celular y revisar la tienda sin sesión.

Referencias: [políticas de filas](https://supabase.com/docs/guides/database/postgres/row-level-security), [permisos de archivos](https://supabase.com/docs/guides/storage/security/access-control), [claves públicas](https://supabase.com/docs/guides/api/api-keys).
