# Hammerz — Agente conversacional (Scuba Malapascua / producto base)

Este repo es el agente de WhatsApp de **Scuba Malapascua** (Node/Express + SDK de
Anthropic) — y a la vez la **base del producto**: un cliente nuevo se clona del repo más
avanzado existente, normalmente este. **En producción real en Railway.**

`AGENT_MODE` decide todo: `simulated` (por defecto, no toca nada real) o `live` (habla de
verdad con el CRM). El mismo interruptor gobierna el playground de pruebas Y el webhook
real de WhatsApp — no hay forma de separar ambos usos con la config actual (ver más abajo,
"riesgo conocido sin resolver").

## Arquitectura: sin monorepo

Cada cliente de Hammerz es un despliegue TOTALMENTE independiente: 3 repos
(backend/frontend/agente) + su propio Postgres en Railway. Sin import compartido entre
clientes. Un arreglo genérico se propaga A MANO a cada cliente que lo necesite.

Repos activos hoy:
- **Malapascua** (= este repo = producto base): `C:\ScubaCRM\backend`,
  `C:\ScubaCRM\frontend`, `Hammerz\agent-playground`.
- **Galápagos Travellers**: `Hammerz\clients\galapagos-travellers\{backend,frontend,agent}`
  — casi el mismo código, pero **NO copiar cambios de aquí a allá sin adaptar**: cada
  centro tiene su propio catálogo, moneda, reglas de negocio y prosa comercial.
- **cost-panel**: panel interno de Hammerz que centraliza el gasto de Anthropic/WhatsApp
  de todos los agentes — no es un cliente.

## Desplegar: SIEMPRE `git push`, nunca `railway up`

Conectado a GitHub con autodeploy. `railway up` en un servicio así conectado NO
persiste. Antes de dar algo por desplegado: `git log --oneline origin/main..HEAD` debe
salir vacío.

## El precio de un servicio vive aquí Y en el frontend — nunca solo aquí

`knowledge.js` tiene el precio en prosa (lo que el agente cotiza). El precio real de
facturación vive en `frontend/src/lib/constants.js` → `CATALOG`. **Cambiar solo uno de los
dos deja al agente cotizando un número y al CRM facturando otro** — tocar siempre ambos a
la vez.

## Batería de pruebas (`e2e-suite.js`, en el repo del backend)

**No correr la batería completa de forma proactiva** — cada pasada son decenas de
conversaciones reales que llaman de verdad a la API de Anthropic, con coste real. Preguntar
siempre antes, incluso si ya se autorizó antes en la misma sesión (una autorización vale
solo para esa tarea concreta).

Para probar este agente en local: arrancarlo en un puerto libre con `AGENT_MODE=live` y
las credenciales del playground (`PLAYGROUND_USER`/`PLAYGROUND_PASSWORD` — sin ellas, las
rutas del playground responden 401/503). Si se necesita medir coste real de las pruebas,
pasar `HAMMERZ_COST_BUCKET=testing` (en vez del `sales` de producción) para que el gasto
quede visible en el cost-panel pero separado de las conversaciones reales de clientes.

## Escribir/tocar `knowledge.js`

- El tono debe sonar a alguien DEL centro (cercano, con conocimiento real del sitio), no a
  un chatbot externo ni a un folleto de ventas.
- Nunca inventar un dato del centro que no esté confirmado — si algo no se sabe, decirlo
  con naturalidad y ofrecer consultarlo con el Manager (nunca "con el centro", como si el
  agente no fuera parte de él).
- Cualquier cosa que el agente traslade para que la revise una persona (cancelación,
  modificación, un caso que no sabe resolver) se habla siempre en términos de "el Manager",
  nunca de "el centro" como entidad externa.
- Un extra de pago que se AÑADE a una reserva ya existente (un transfer, una pieza de
  equipo) nunca debe pasar por `create_booking` otra vez ni por `request_modification`
  describiéndolo como el nuevo servicio — las dos rutas SUSTITUYEN lo que ya había en vez
  de añadir. Usar una herramienta pensada para sumar (p. ej. `add_booking_item`), que solo
  añade una línea a la factura sin tocar el resto.

## ⚠️ Riesgo conocido, sin resolver: el playground está público

El playground de pruebas (`/`) es accesible con usuario/contraseña, pero el interruptor
`AGENT_MODE=live` es el MISMO que usa el webhook real de WhatsApp — no hay forma de tener
un entorno de pruebas separado del entorno real con la config actual sin apagar también el
WhatsApp real. Si se toca esto, diseñar primero cómo separar ambos usos (protección de
acceso al `/chat` público, o un despliegue de demo aparte en modo `simulated`) antes de
cambiar nada.

## Convenciones de sesión (si trabajas con Claude Code aquí)

- Cada cambio se despliega en el mismo turno en que se hace (con confirmación antes de un
  `git push` a producción real).
- Si `git status` muestra cambios inesperados no propios de la tarea en curso, es probable
  que otra sesión esté trabajando en paralelo sobre este mismo `server.js`/`knowledge.js`
  — aislar el propio cambio antes de commitear, nunca desplegar código ajeno sin
  verificarlo primero.
