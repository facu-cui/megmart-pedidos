# Megmart Pedidos · versión con base de datos

Tablero del depósito: se pega el pedido de WhatsApp y cada producto se marca cuando se saca, se limpia (o se le pone el logo) y se embala.

Funciona solo con **GitHub Pages** (publica la página) y **Supabase** (guarda los datos). No hay servidor propio, ni usuario y contraseña.

## Qué tiene

- **Base de datos compartida (Supabase).** Todos ven los mismos pedidos, y lo que marca uno aparece solo en los demás, sin recargar.
- **No se pisan los cambios.** Si dos personas tocan el mismo producto al mismo tiempo, la app trae lo último y suma las dos cosas.
- **Sin login.** Se entra directo con el link. La primera vez pregunta el nombre de quien usa el celular.
- **Quién hizo qué.** En cada producto se ve "Último cambio: Juan · hace 5 min", y en cada pedido quién lo cargó.
- **El machete aparece solo.** Debajo de cada alfombra, combo o bandeja se ve qué logo lleva, si el modelo está en el machete (ej. "Combo Cronos" → Solo conductor, logo Megmart).
- **Mandar estado.** Botón en cada pedido que arma un resumen ("3 de 10 listos", qué falta) para mandarlo por WhatsApp.
- **Buscador de pedidos** en el inicio. Los terminados se muestran de a 5.
- **Pedidos viejos.** Si un celular tenía pedidos de la versión anterior, la app ofrece subirlos a la base.
- **Sin internet.** Avisa arriba, sigue mostrando los últimos datos y, cuando vuelve la conexión, trae todo de nuevo.
- Se puede instalar en el celular (**⋮ → Agregar a pantalla principal**).

> **Importante:** como no hay login, cualquiera que tenga el link puede ver, cambiar o borrar pedidos. No lo compartas afuera del equipo.

## Puesta en marcha (una sola vez)

### 1. Supabase
1. Creá un proyecto en [supabase.com](https://supabase.com) (región South America, São Paulo).
2. **SQL Editor → New query**: pegá todo `supabase-megmart.sql` y tocá **Run**. Tiene que decir "Success".
3. **Project Settings → Data API**: copiá la Project URL. **API Keys**: copiá la Publishable key (nunca la Secret).
4. Pegalas en `config.js`.

### 2. GitHub Pages
Subí a un repositorio público estos 8 archivos y activá **Settings → Pages → Deploy from a branch → main / (root)**:

`index.html`, `app.js`, `logica.js`, `config.js`, `styles.css`, `manifest.json`, `sw.js`, `icono.png`

La app se prueba con el link de GitHub Pages. Abriendo el `index.html` con doble clic no anda.

> Si se publica en la **misma dirección** que la versión anterior, cada celular va a ofrecer subir los pedidos que tenía guardados.

## Archivos

| Archivo | Qué es |
|---|---|
| `index.html`, `styles.css` | La pantalla |
| `app.js` | Guardado en Supabase y actualización en vivo |
| `logica.js` | Lectura del mensaje de WhatsApp, etapas y machete |
| `config.js` | Dirección y clave pública de Supabase |
| `supabase-megmart.sql` | Crea las tablas y permisos en Supabase (no se sube a GitHub) |
| `sw.js`, `manifest.json`, `icono.png` | Para instalarla en el celular |

## Límites del plan gratis de Supabase

- Megmart casi no ocupa lugar (no guarda fotos): el plan gratis alcanza de sobra.
- Si el proyecto no se usa durante 7 días seguidos, Supabase lo pausa. Se reactiva desde el panel con **Restore project**.
