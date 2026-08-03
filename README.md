# Hammerz · Agent Playground 🤿

Playground **aislado** para probar nuestro propio agente de reservas (Claude + tool use).
No tiene NINGUNA conexión con el CRM ni con la base de datos: la herramienta de crear
reserva está **simulada**. Sirve para evaluar la calidad del agente por texto, sin WhatsApp.

## Cómo arrancarlo

1. Abre una terminal en esta carpeta (`agent-playground`).
2. Instala las dependencias (solo la primera vez):
   ```
   npm install
   ```
3. Crea tu archivo de clave: copia `.env.example` a `.env` y pega tu `ANTHROPIC_API_KEY`.
   🔒 La clave va SOLO en el `.env`, nunca en el chat ni en el código.
4. Arranca:
   ```
   npm start
   ```
5. Abre en el navegador: **http://localhost:3010**

## Qué puedes probar

Escribe como si fueras un cliente. Por ejemplo:
- *"Hola, quiero bucear con tiburones zorro la semana que viene"*
- *"Soy Open Water, ¿puedo?"*  (el agente debe explicarte las dos vías)
- Dale fecha, servicio, nº de personas y titulación → debe enviarte un resumen y pedir "Confirmar".
- Al confirmar, verás la tarjeta **🔧 create_booking** con los datos (simulado).

## Estructura

- `server.js` — servidor + bucle agéntico (tool use).
- `knowledge.js` — **el "config" del cliente**: base de conocimiento (servicios, precios,
  reglas, puntos de buceo) y definición de herramientas. Es lo único que cambia por cliente.
- `public/index.html` — la interfaz de chat.

## Siguientes pasos (cuando toque)

- Añadir herramientas `cancel_booking` / `modify_booking` (sumar objetos a `TOOLS` + su handler).
- Conectar un canal real de WhatsApp (Twilio/Meta).
- Conectar las herramientas con la lógica real del CRM (en vez de simular).
- Persistir el historial de conversación por cliente.
