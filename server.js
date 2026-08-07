require('dotenv').config()
const express = require('express')
const path = require('path')
const Anthropic = require('@anthropic-ai/sdk')
const twilio = require('twilio')
const { SYSTEM_PROMPT, TOOLS } = require('./knowledge')

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
const MODEL = process.env.MODEL || 'claude-sonnet-5'
const PORT = process.env.PORT || 3010

// ─── INTERRUPTOR ───────────────────────────────────────────────────────────
// AGENT_MODE = 'simulated' (por defecto, aislado, no toca nada) | 'live' (habla con el CRM real)
const AGENT_MODE    = process.env.AGENT_MODE || 'simulated'
const BACKEND_URL   = process.env.BACKEND_URL || 'https://scubacrm-backend-production.up.railway.app'
const DEMO_PHONE    = process.env.DEMO_PHONE || '+34600000000'
const AGENT_SECRET  = process.env.AGENT_SECRET || ''
// Tope de vueltas del bucle agéntico. Configurable sobre todo para poder forzar el
// camino de fallo de forma determinista al probar (AGENT_MAX_STEPS=0).
const AGENT_MAX_STEPS = Number(process.env.AGENT_MAX_STEPS ?? 6)

// ─── Twilio (WhatsApp real) ─────────────────────────────────────────────────
const TWILIO_ACCOUNT_SID     = process.env.TWILIO_ACCOUNT_SID || ''
const TWILIO_AUTH_TOKEN      = process.env.TWILIO_AUTH_TOKEN || ''
const TWILIO_WHATSAPP_NUMBER = process.env.TWILIO_WHATSAPP_NUMBER || ''
const twilioClient = (TWILIO_ACCOUNT_SID && TWILIO_AUTH_TOKEN) ? twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN) : null

const app = express()
app.use(express.json())
app.use(express.static(path.join(__dirname, 'public')))

// ─────────────────────────────────────────────────────────────────────────────
// HERRAMIENTAS (simuladas). NO tocan ninguna base de datos ni el CRM real.
// Aquí es donde, en el futuro, se conectaría con la lógica real de reservas.
// ─────────────────────────────────────────────────────────────────────────────
// Los packs en el CRM se llaman "Pack Tridente/Orbe/Corona"; el agente usa el nombre corto.
// Normalizamos para que el CRM los reconozca exactamente y no queden "Sin clasificar".
function normalizeService(s) {
  if (!s) return s
  const key = s.trim().toLowerCase().replace(/^pack\s+/, '')
  const packs = { tridente: 'Pack Tridente', orbe: 'Pack Orbe', corona: 'Pack Corona' }
  return packs[key] || s.trim()
}

// Detección RÁPIDA de idioma (solo español/inglés claros) para no llamar a la IA en los casos
// más comunes. Si no lo tiene claro devuelve null → se usa la detección universal por IA.
function detectLang(text) {
  if (!text || typeof text !== 'string') return null
  const t = text.toLowerCase()
  if (/[¿¡ñ]/.test(t)) return 'español'   // puntuación/letra muy específica del español
  const es = (t.match(/\b(que|qué|quiero|quería|quisiera|hola|gracias|para|con|cuánto|cuántos|días|dias|buceo|bucear|reserva|reservar|soy|tengo|hacer|dónde|donde|cuándo|cuando|precio|inmersión|inmersion|inmersiones|somos|necesito|también)\b/g) || []).length
  const en = (t.match(/\b(the|would|like|with|and|hello|want|book|dive|diving|dives|your|thanks|thank|days|how|are|for|shark|sharks|price|when|where|can|need|please|about|there|have|will|this|that|also)\b/g) || []).length
  if (en >= 2 && en > es * 2) return 'inglés'
  if (es >= 2 && es > en * 2) return 'español'
  return null
}

// Detección UNIVERSAL por IA (Haiku): detecta CUALQUIER idioma. Solo se usa cuando la detección
// rápida no lo tiene claro. Devuelve el nombre del idioma en español (ej: "alemán", "francés").
async function detectLangAI(text) {
  try {
    const r = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 16,
      system: 'Detecta el idioma del texto del usuario. Responde SOLO con el nombre del idioma en español, en minúsculas y sin nada más (ej: "inglés", "alemán", "francés", "italiano", "portugués", "chino", "árabe", "ruso", "japonés", "coreano", "hindi").',
      messages: [{ role: 'user', content: String(text).slice(0, 500) }],
    })
    const out = r.content.filter(c => c.type === 'text').map(c => c.text).join('').trim().toLowerCase().replace(/[.\s]+$/, '')
    return out && out.length > 0 && out.length < 30 ? out : null
  } catch (err) {
    console.error('[idioma] detección IA falló:', err.message)
    return null
  }
}

// Extrae el NOMBRE de pila del cliente de su mensaje, SOLO si se presenta con claridad
// (ej: "me llamo Luis", "soy Ana", "my name is Liam", "ich heiße Max"). Si no, devuelve null.
// Sirve para ponerle nombre al Lead en cuanto el cliente lo dice, en cualquier idioma.
async function extractClientName(text) {
  try {
    const r = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 16,
      system: 'Eres un extractor de nombres. Del mensaje del cliente, devuelve SOLO su nombre de pila y ÚNICAMENTE si se presenta con claridad (ej: "me llamo Luis", "soy Ana", "my name is Liam", "this is Marco", "ich heiße Max"). Responde solo el nombre, sin nada más. Si el cliente NO dice su nombre, responde exactamente "none". Nunca inventes un nombre a partir de otras palabras (lugares, países, etc.).',
      messages: [{ role: 'user', content: String(text).slice(0, 500) }],
    })
    const out = r.content.filter(c => c.type === 'text').map(c => c.text).join('').trim().replace(/[.\s]+$/, '')
    if (!out || out.toLowerCase() === 'none' || out.length > 40) return null
    return out
  } catch (err) {
    console.error('[lead] extracción de nombre falló:', err.message)
    return null
  }
}

// Teléfonos a los que ya les hemos capturado el nombre en esta sesión → no reintentamos.
const capturedNames = new Set()

// Registra un mensaje en la conversación (Lead) del CRM. Solo en modo live.
// Así el manager podrá ver el espejo de la conversación (módulo Leads).
// Si se pasa clientName, el CRM le pone/actualiza el nombre al Lead.
// Devuelve la respuesta del CRM (incluye agentPaused) o null si algo falla.
async function logLeadMessage(phone, direction, author, content, clientName) {
  if (AGENT_MODE !== 'live' || !content) return null
  try {
    const { data } = await postJSON(`${BACKEND_URL}/api/leads/message`, {
      clientPhone: phone, direction, author, content,
      ...(clientName ? { clientName } : {}),
    })
    return data
  } catch (err) {
    console.error('[lead] registro de mensaje falló:', err.message)
    return null
  }
}

// Avisa al CRM de que el agente NO ha podido responder a este cliente, para que la
// conversación salte en rojo en el módulo Leads y el manager tome el relevo.
// Fire-and-forget: si esto falla, no debe tumbar la respuesta al cliente.
async function reportAgentFailure(phone, reason) {
  if (AGENT_MODE !== 'live') return
  try {
    await postJSON(`${BACKEND_URL}/api/leads/agent-failure`, { clientPhone: phone, reason })
    console.log(`[agent] ⚠️  Fallo reportado al CRM (${reason}) para ${phone}`)
  } catch (err) {
    console.error('[agent] No se pudo reportar el fallo al CRM:', err.message)
  }
}

// Mensaje que recibe el cliente cuando el agente no ha sido capaz de responder: mejor
// esto que el silencio absoluto. Sin llamadas a la API — es el camino de fallo, tiene
// que funcionar siempre. `lang` viene de la detección de idioma que ya se hace arriba.
function bridgeMessage(lang) {
  return lang === 'español'
    ? 'Dame un momento, lo consulto con el equipo y te contesto enseguida 🙏'
    : 'Give me a moment, let me check this with the team and I\'ll get right back to you 🙏'
}

async function postJSON(url, body) {
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Agent-Secret': AGENT_SECRET },
    body: JSON.stringify(body),
  })
  let data = null
  try { data = await r.json() } catch { /* respuesta sin JSON */ }
  return { status: r.status, data }
}

async function runTool(name, input, phone) {
  const clientPhone = phone || DEMO_PHONE
  // ── MODO LIVE: llama a los endpoints reales del CRM ──
  if (AGENT_MODE === 'live') {
    try {
      if (name === 'create_booking') {
        const service = normalizeService(input.service)
        // Resumen de respaldo en inglés (fallback). Lo que ve el manager en "Notas" son las
        // notas limpias del agente (campo notes), que el CRM prioriza sobre este resumen.
        const summary = [
          `Service: ${service}`,
          `Start date: ${input.activityDate}`,
          `Divers: ${input.numPeople} · ${input.certification}`,
          `Rental equipment: ${input.rentalEquipment ? 'yes' : 'own equipment'}`,
          input.totalPrice ? `Total: ${Number(input.totalPrice).toLocaleString()} PHP` : null,
        ].filter(Boolean).join('\n')
        // Mandamos los datos YA estructurados: el CRM se fía de ellos y no tiene que readivinar.
        const { status, data } = await postJSON(`${BACKEND_URL}/api/webhook/booking`, {
          clientName: input.clientName, clientPhone, summary,
          service,
          activityDate: input.activityDate,
          numPeople: input.numPeople,
          certification: input.certification,
          notes: input.notes || null,
          totalPrice: input.totalPrice || null,
          language: input.language || 'es',
          // Desglose día a día de un pack a medida (opcional — solo lo manda el modelo
          // para "Personalized fun dive pack"). El backend valida su forma por su cuenta
          // y lo descarta sin romper la reserva si viene mal formado.
          days: Array.isArray(input.days) ? input.days : null,
        })
        console.log('[tool·live] create_booking →', status, data)
        return { ok: status < 300, live: true, backendStatus: status, ...data, ...input }
      }
      if (name === 'request_cancellation') {
        const { status, data } = await postJSON(`${BACKEND_URL}/api/webhook/booking/cancel`, {
          clientName: input.clientName, clientPhone,
          activityDate: input.activityDate || null,
          reason: input.reason || null,
        })
        console.log('[tool·live] request_cancellation →', status, data)
        return { ok: status < 300, live: true, backendStatus: status, ...data, ...input }
      }
      if (name === 'request_modification') {
        const { status, data } = await postJSON(`${BACKEND_URL}/api/webhook/booking/modify`, {
          clientName: input.clientName, clientPhone, request: input.change,
          newActivityDate: input.newActivityDate || null,
          newNumPeople: (input.newNumPeople !== undefined && input.newNumPeople !== null) ? input.newNumPeople : null,
          newService: input.newService ? normalizeService(input.newService) : null,
          newCertification: input.newCertification || null,
          newRentalStatus: input.newRentalStatus || null,
          dayIndex: (input.dayIndex !== undefined && input.dayIndex !== null) ? input.dayIndex : null,
          // Quitar un día entero del pack (el resto sigue en pie) — equivalente por días
          // de dar de baja a un buceador. `removeDayDate` es el seguro contra quitar el
          // día equivocado: el backend rechaza la petición si no cuadra con el índice.
          removeDayIndex: (input.removeDayIndex !== undefined && input.removeDayIndex !== null) ? input.removeDayIndex : null,
          removeDayDate: input.removeDayDate || null,
        })
        console.log('[tool·live] request_modification →', status, data)
        return { ok: status < 300, live: true, backendStatus: status, ...data, ...input }
      }
    } catch (err) {
      console.error('[tool·live] Error:', err.message)
      return { ok: false, live: true, error: err.message, ...input }
    }
  }

  // ── MODO SIMULADO (por defecto): no toca nada, devuelve datos falsos ──
  if (name === 'create_booking') {
    const bookingRef = Math.random().toString(36).slice(2, 8).toUpperCase()
    console.log('[tool] create_booking (SIMULADO):', input)
    return { ok: true, simulated: true, bookingRef, ...input }
  }
  if (name === 'request_cancellation') {
    console.log('[tool] request_cancellation (SIMULADO):', input)
    return { ok: true, simulated: true, status: 'CANCELLATION_REQUESTED', ...input }
  }
  if (name === 'request_modification') {
    console.log('[tool] request_modification (SIMULADO):', input)
    return { ok: true, simulated: true, status: 'MODIFICATION_REQUESTED', ...input }
  }
  return { ok: false, error: `Herramienta desconocida: ${name}` }
}

// ─────────────────────────────────────────────────────────────────────────────
// Un turno completo del bucle agéntico (tool use): recibe el historial visible +
// el teléfono, devuelve la respuesta de texto + las herramientas usadas. La usan
// tanto /chat (playground en el navegador) como el webhook real de WhatsApp.
// ─────────────────────────────────────────────────────────────────────────────
async function runAgentTurn(history, phone) {
  const convo = history.map(m => ({ role: m.role, content: m.content }))
  const systemText = SYSTEM_PROMPT.replace('{{TODAY}}', new Date().toISOString().slice(0, 10))
  // El knowledge base no cambia entre mensajes → lo cacheamos (solo este bloque lleva
  // cache_control). La primera llamada lo procesa entero; las siguientes lo cobran a ~1/10.
  const system = [{ type: 'text', text: systemText, cache_control: { type: 'ephemeral' } }]

  // Refuerzo de idioma: detectamos el idioma del ÚLTIMO mensaje del cliente y añadimos una
  // orden específica y fresca en un 2º bloque de system (sin cache_control, va justo antes de
  // los mensajes → máxima relevancia). Una orden concreta ("responde en inglés") pega mucho
  // más que la regla general enterrada en el prompt.
  const lastUserMsg = [...history].reverse().find(m => m.role === 'user')
  const lastText = lastUserMsg && typeof lastUserMsg.content === 'string' ? lastUserMsg.content : ''
  let lang = detectLang(lastText)                                    // rápido (ES/EN)
  if (!lang && lastText.trim().length > 1) lang = await detectLangAI(lastText)  // universal (cualquier idioma)
  if (lang) {
    system.push({ type: 'text', text: `⚠️ IDIOMA OBLIGATORIO DE ESTA RESPUESTA: el último mensaje del cliente está en ${lang}. Escribe tu respuesta ENTERA en ${lang}, sin ninguna excepción.` })
  }

  // ── Registro del ENTRANTE + puerta de PAUSA (solo modo live) ───────────────────────────
  // Registramos el mensaje del cliente en el Lead (y capturamos su nombre si se presenta).
  // Si el agente está en pausa en esta conversación (el manager la está llevando), el agente
  // NO responde: se queda callado y el manager contesta a mano.
  if (AGENT_MODE === 'live') {
    let clientName = null
    if (!capturedNames.has(phone) && lastText.trim().length > 1) {
      clientName = await extractClientName(lastText)
      if (clientName) capturedNames.add(phone)
    }
    const leadState = await logLeadMessage(phone, 'inbound', 'client', lastText, clientName)
    if (leadState && leadState.agentPaused) {
      console.log('[agent] Conversación en pausa → el agente calla (lo lleva el manager).')
      return { reply: '', paused: true, toolCalls: [] }
    }
  }

  const toolCalls = []
  let reply = ''
  let failReason = null

  // Reservas ya creadas en ESTE turno. El knowledge base es explícito ("UNA SOLA llamada
  // a create_booking"), pero el 31/07 el modelo la llamó dos veces, creó dos reservas
  // reales y se quedó dando vueltas intentando reconciliarlo hasta agotar el bucle
  // (quedándose mudo). Esta guarda corta las dos cosas de raíz.
  let bookingCreated = null

  try {
    // Bucle agéntico: si el modelo pide una herramienta, la ejecutamos y seguimos.
    for (let step = 0; step < AGENT_MAX_STEPS; step++) {
      const resp = await client.messages.create({
        model: MODEL,
        max_tokens: 1024,
        system,
        tools: TOOLS,
        messages: convo,
      })

      // Confirma en la terminal que el caché funciona:
      //   cache_creation = tokens escritos al caché (1ª vez, ~1.25x)
      //   cache_read     = tokens servidos del caché (siguientes, ~0.1x)  ← lo que queremos ver crecer
      const u = resp.usage
      console.log(`[caché] escritos:${u.cache_creation_input_tokens || 0} · leídos:${u.cache_read_input_tokens || 0} · sin cachear:${u.input_tokens}`)

      // El modelo puede pedir VARIAS herramientas en un mismo turno (parallel tool use).
      // Hay que ejecutarlas TODAS y devolver un tool_result por cada tool_use, o la API
      // rechaza la siguiente llamada con un 400 ("tool_use sin su tool_result").
      const toolUses = resp.content.filter(c => c.type === 'tool_use')
      if (resp.stop_reason === 'tool_use' && toolUses.length) {
        convo.push({ role: 'assistant', content: resp.content })
        const results = []
        for (const tu of toolUses) {
          let result
          if (tu.name === 'create_booking' && bookingCreated) {
            // Segunda llamada a create_booking en el mismo turno → NO se ejecuta.
            // Le devolvemos la reserva que ya existe y una instrucción clara de cerrar.
            result = {
              ...bookingCreated,
              ok: true,
              alreadyCreated: true,
              warning: 'Ya has creado la reserva de este cliente en este mismo turno. NO crees otra. Responde ya al cliente confirmándole la reserva existente con su resumen.',
            }
            console.warn('[agent] ⚠️  create_booking duplicado bloqueado (ya había una reserva en este turno).')
          } else {
            result = await runTool(tu.name, tu.input, phone)
            if (tu.name === 'create_booking' && result && result.ok !== false) bookingCreated = result
          }
          toolCalls.push({ name: tu.name, input: tu.input, result })
          results.push({ type: 'tool_result', tool_use_id: tu.id, content: JSON.stringify(result) })
        }
        convo.push({ role: 'user', content: results })
        continue
      }

      reply = resp.content.filter(c => c.type === 'text').map(c => c.text).join('\n').trim()
      break
    }

    // ── Rescate ────────────────────────────────────────────────────────────────────
    // Si salimos del bucle sin texto, el modelo se quedó pidiendo herramientas sin cerrar
    // nunca. Una última llamada con tool_choice 'none' le obliga a contestar con texto.
    // OJO: hay que seguir pasando `tools`, porque el historial ya contiene bloques
    // tool_use y la API devuelve 400 si no están declaradas.
    if (!reply) {
      console.warn('[agent] Bucle agotado sin respuesta → intentando pasada de rescate…')
      const rescue = await client.messages.create({
        model: MODEL,
        max_tokens: 1024,
        system: [...system, { type: 'text', text: 'CIERRA AHORA: responde al cliente con un mensaje de texto, sin usar ninguna herramienta. Si ya has registrado su reserva, confírmasela con el resumen. Si te falta algo, pregúntaselo con naturalidad.' }],
        tools: TOOLS,
        tool_choice: { type: 'none' },
        messages: convo,
      })
      reply = rescue.content.filter(c => c.type === 'text').map(c => c.text).join('\n').trim()
      if (reply) console.log('[agent] ✅ Rescate conseguido: el agente sí ha respondido.')
    }
  } catch (err) {
    // Antes esto se propagaba: en el webhook de WhatsApp acababa en un log y el cliente
    // no recibía absolutamente nada.
    console.error('[agent] Error en el bucle agéntico:', err.message)
    failReason = 'error'
  }

  // ── Red de seguridad ───────────────────────────────────────────────────────────
  // Ni el bucle ni el rescate han producido respuesta. En vez de dejar al cliente en
  // silencio (el bug del 31/07), le mandamos un mensaje puente y avisamos al manager.
  if (!reply) {
    failReason = failReason || 'loop_exhausted'
    reply = bridgeMessage(lang)
    console.warn(`[agent] ⚠️  Sin respuesta (${failReason}) → mensaje puente al cliente + alerta al manager.`)
  }
  if (failReason) {
    reportAgentFailure(phone, failReason).catch(() => {})
  }

  // Registrar la respuesta del agente (saliente) en el Lead. El entrante ya se registró antes de
  // generar (para la puerta de pausa). Fire-and-forget: no bloquea la respuesta al cliente.
  if (AGENT_MODE === 'live' && reply) {
    logLeadMessage(phone, 'outbound', 'agent', reply)
      .catch(err => console.error('[lead] registro saliente falló:', err.message))
  }

  return { reply, toolCalls, paused: false, failReason }
}

// ─────────────────────────────────────────────────────────────────────────────
// Chat: la usa el playground en el navegador. Recibe el historial visible completo
// (lo mantiene el propio navegador) y corre un turno del bucle agéntico.
// ─────────────────────────────────────────────────────────────────────────────
app.post('/chat', async (req, res) => {
  try {
    if (!process.env.ANTHROPIC_API_KEY) {
      return res.status(500).json({ error: 'Falta ANTHROPIC_API_KEY. Créala en el archivo .env (ver README).' })
    }
    const history = Array.isArray(req.body.messages) ? req.body.messages : []
    const phone = req.body.phone || DEMO_PHONE   // teléfono del perfil activo
    const { reply, toolCalls, paused } = await runAgentTurn(history, phone)
    res.json({ reply, toolCalls, paused })
  } catch (err) {
    console.error('[agent] Error:', err.message)
    res.status(500).json({ error: err.message })
  }
})

// El frontend consulta el modo para avisar si está en LIVE
app.get('/mode', (req, res) => res.json({ mode: AGENT_MODE }))

// Proxy: trae del CRM los mensajes salientes de una reserva (para el polling en modo live).
// Server-to-server, así el navegador no lidia con CORS ni con la URL del backend.
app.get('/booking-messages/:id', async (req, res) => {
  if (AGENT_MODE !== 'live') return res.json({ messages: [] })
  try {
    const r = await fetch(`${BACKEND_URL}/api/bookings/${req.params.id}`, {
      headers: { 'X-Agent-Secret': AGENT_SECRET },
    })
    if (!r.ok) return res.status(r.status).json({ messages: [] })
    const b = await r.json()
    const messages = (b.messages || [])
      .filter(m => m.direction === 'outbound')
      .sort((a, x) => new Date(a.sentAt) - new Date(x.sentAt))
      .map(m => ({
        id: m.id,
        content: m.content || '',
        sentAt: m.sentAt,
        attachmentName: m.attachmentName || null,
        // Apunta a NUESTRO propio proxy, no al backend directamente — el navegador
        // no tiene ninguna credencial válida (ni JWT de manager, ni la clave del
        // agente, que nunca debe llegar al navegador) para pedir la ruta protegida.
        attachmentUrl: m.attachmentUrl ? `/invoice-proxy/${req.params.id}` : null,
      }))
    res.json({ status: b.status, messages })
  } catch (err) {
    res.status(500).json({ messages: [], error: err.message })
  }
})

// Proxy: sirve la factura (HTML) al navegador del playground. El navegador no tiene
// ninguna credencial válida para pedir la ruta protegida del backend directamente
// (ver comentario arriba) — el servidor del agente la pide con su X-Agent-Secret y
// se la pasa ya lista.
app.get('/invoice-proxy/:bookingId', async (req, res) => {
  if (AGENT_MODE !== 'live') return res.status(404).send('No disponible en modo simulado')
  try {
    const r = await fetch(`${BACKEND_URL}/api/bookings/${req.params.bookingId}/invoice`, {
      headers: { 'X-Agent-Secret': AGENT_SECRET },
    })
    const html = await r.text()
    res.status(r.status).setHeader('Content-Type', 'text/html; charset=utf-8').send(html)
  } catch (err) {
    res.status(500).send('Error cargando la factura: ' + err.message)
  }
})

// Proxy: trae del CRM los mensajes que el MANAGER escribió a mano en la conversación (Lead),
// para que la ventana del cliente (playground) los muestre → la otra mitad del espejo.
// Solo mensajes de autor 'manager' (los del agente ya se ven por la respuesta del /chat).
app.get('/lead-messages/:phone', async (req, res) => {
  if (AGENT_MODE !== 'live') return res.json({ messages: [], agentPaused: false })
  try {
    const r = await fetch(`${BACKEND_URL}/api/leads/by-phone/${encodeURIComponent(req.params.phone)}`, {
      headers: { 'X-Agent-Secret': AGENT_SECRET },
    })
    if (!r.ok) return res.json({ messages: [], agentPaused: false })
    const lead = await r.json()
    const messages = (lead.messages || [])
      .filter(m => m.direction === 'outbound' && m.authorName === 'manager')
      .sort((a, b) => new Date(a.sentAt) - new Date(b.sentAt))
      .map(m => ({ id: m.id, content: m.content || '', sentAt: m.sentAt }))
    res.json({ messages, agentPaused: !!lead.agentPaused })
  } catch (err) {
    res.json({ messages: [], agentPaused: false })
  }
})

// Reconstruye el historial de una conversación real desde el CRM (única fuente de verdad,
// no guardamos nada en memoria del propio agente): un mensaje inbound/outbound por línea,
// convertido al formato {role, content} que espera Claude.
async function fetchLeadHistory(phone) {
  try {
    const r = await fetch(`${BACKEND_URL}/api/leads/by-phone/${encodeURIComponent(phone)}`, {
      headers: { 'X-Agent-Secret': AGENT_SECRET },
    })
    if (!r.ok) return []
    const lead = await r.json()
    return (lead.messages || [])
      .filter(m => m.content)
      .sort((a, b) => new Date(a.sentAt) - new Date(b.sentAt))
      .map(m => ({ role: m.direction === 'inbound' ? 'user' : 'assistant', content: m.content }))
  } catch (err) {
    console.error('[whatsapp] no se pudo cargar el historial del lead:', err.message)
    return []
  }
}

// Webhook de WhatsApp: Twilio llama aquí cada vez que un cliente escribe de verdad.
// Solo activo en modo live (en simulado no tiene sentido, no hay CRM real al que apuntar).
app.post('/webhook/whatsapp', express.urlencoded({ extended: false }), async (req, res) => {
  // Verificamos que la petición viene realmente de Twilio (firma con nuestro Auth Token),
  // para que nadie pueda simular mensajes de clientes y disparar reservas falsas.
  const signature = req.headers['x-twilio-signature']
  const url = `https://${req.get('host')}${req.originalUrl}`
  const validSignature = TWILIO_AUTH_TOKEN && twilio.validateRequest(TWILIO_AUTH_TOKEN, signature, url, req.body)
  if (!validSignature) {
    console.warn('[whatsapp] Firma de Twilio inválida — petición rechazada.')
    return res.status(403).send('Firma inválida')
  }

  // Respondemos YA a Twilio con un TwiML vacío (si tardamos, Twilio reintenta el webhook).
  // El envío real de la respuesta va aparte, por la API de Twilio, cuando el agente termine.
  res.status(200).type('text/xml').send('<Response></Response>')

  if (AGENT_MODE !== 'live' || !twilioClient) return
  const from = req.body.From    // 'whatsapp:+34...'
  const body = (req.body.Body || '').trim()
  if (!from || !body) return
  const phone = from.replace('whatsapp:', '')

  try {
    const history = await fetchLeadHistory(phone)
    history.push({ role: 'user', content: body })
    const { reply, paused } = await runAgentTurn(history, phone)
    if (reply && !paused) {
      await twilioClient.messages.create({
        from: `whatsapp:${TWILIO_WHATSAPP_NUMBER}`,
        to: from,
        body: reply,
      })
    }
  } catch (err) {
    console.error('[whatsapp] Error procesando mensaje entrante:', err.message)
  }
})

app.listen(PORT, () => {
  console.log(`\n🤿  Hammerz Agent Playground  →  http://localhost:${PORT}`)
  console.log(`    Modelo: ${MODEL}`)
  if (AGENT_MODE === 'live') {
    console.log(`    🟢 MODO LIVE — las acciones van al CRM real: ${BACKEND_URL}`)
    console.log(`       (teléfono de demo: ${DEMO_PHONE})`)
  } else {
    console.log(`    🔒 MODO SIMULADO — aislado, no toca ningún CRM. (AGENT_MODE=live para conectar)`)
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    console.log('    ⚠️  Falta ANTHROPIC_API_KEY en el .env — el chat no responderá hasta ponerla.\n')
  } else {
    console.log('')
  }
})
