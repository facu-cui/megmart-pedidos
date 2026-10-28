# Megmart Pedidos · versión con base de datos

Tablero del depósito: se pega el pedido de WhatsApp y cada producto se marca cuando se saca, se limpia (o se le pone el logo) y se embala.

## Qué cambió respecto a la versión anterior

- **Base de datos compartida (Supabase).** Antes cada celular guardaba sus propios pedidos y nadie veía lo del otro. Ahora todos ven lo mismo, y lo que marca uno aparece solo en los demás, sin recargar.
- **No se pisan los cambios.** Si dos personas tocan el mismo producto al mismo tiempo, la app trae lo último y suma las dos cosas.
- **Login.** Hace falta la cuenta del depósito para entrar. Solo las cuentas de la lista de Megmart pueden ver o cambiar pedidos.
- **Quién hizo qué.** Cada celular pone el nombre de quien lo usa. En cada producto se ve "Último cambio: Juan · hace 5 min", y en cada pedido quién lo cargó.
- **El machete aparece solo.** Debajo de cada alfombra, combo o bandeja se ve qué logo lleva, si el modelo está en el machete (ej. "Combo Cronos" → Solo conductor, logo Megmart).
- **Mandar estado.** Botón en cada pedido que arma un resumen ("3 de 10 listos", qué falta) para mandarlo por WhatsApp.
- **Buscador de pedidos** en el inicio (por nombre o producto). Los terminados se muestran de a 5.
- **Pedidos viejos.** Si un celular tenía pedidos guardados de la versión anterior, la app ofrece subirlos a la base (con las etapas como estaban).
- **Sin internet.** Avisa arriba, sigue mostrando los últimos datos y, cuando vuelve la conexión, trae todo de nuevo.
- Se puede instalar en el celular (**⋮ → Agregar a pantalla principal**).

## Puesta en marcha (una sola vez, ~10 minutos)

Usa el **mismo proyecto de Supabase que McDash**. Las tablas nuevas empiezan con `megmart_` y no tocan nada de McDash.

### 1. Crear la cuenta del depósito
1. En Supabase: **Authentication → Users → Add user → Create new user**.
2. Poné un email y una contraseña para el depósito (por ejemplo `deposito.megmart@...`). Marcá **Auto Confirm User**.

### 2. Crear las tablas
1. Abrí `supabase-megmart.sql` y en la **última línea** cambiá `deposito.megmart@ejemplo.com` por el email del paso 1 (en minúsculas).
2. En Supabase: **SQL Editor → New query**, pegá todo el archivo y tocá **Run**. Tiene que decir "Success".

Para sumar otra cuenta más adelante (por ejemplo una por encargado), creala igual que en el paso 1 y corré solo esto en el SQL Editor:

```sql
insert into public.megmart_miembros (email) values ('otro.email@...');
```

### 3. Probarla en la PC
Doble clic en `abrir-megmart.bat`. Se abre en <http://localhost:8090>. Dejá abierta la ventana negra mientras la usás (hace falta tener Node instalado).

### 4. Publicarla para los celulares
La versión actual está en `https://facu-cui.github.io/megmart-pedidos/`. Quien maneja esa cuenta de GitHub tiene que reemplazar el `index.html` viejo por **todos** los archivos de esta carpeta, menos `servidor.js`, `abrir-megmart.bat` y `supabase-megmart.sql`:

`index.html`, `app.js`, `logica.js`, `config.js`, `styles.css`, `manifest.json`, `sw.js`, `icono.png`

> Si se publica en la **misma dirección**, cada celular va a ofrecer subir los pedidos que tenía guardados. En otra dirección no los ve (el navegador los guarda por dirección).

## Archivos

| Archivo | Qué es |
|---|---|
| `index.html`, `styles.css` | La pantalla (mismo diseño que antes) |
| `app.js` | Login, guardado en Supabase y actualización en vivo |
| `logica.js` | Lectura del mensaje de WhatsApp, etapas y machete |
| `config.js` | Dirección y clave pública de Supabase (las mismas de McDash) |
| `supabase-megmart.sql` | Crea las tablas y permisos en Supabase |
| `sw.js`, `manifest.json`, `icono.png` | Para instalarla en el celular |
| `servidor.js`, `abrir-megmart.bat` | Para usarla en la PC |

## Límites del plan gratis de Supabase

- Megmart casi no ocupa lugar (no guarda fotos), así que comparte sin problema el espacio con McDash.
- Si el proyecto no se usa durante 7 días seguidos, Supabase lo pausa (y se pausan las dos apps). Se reactiva desde el panel.
