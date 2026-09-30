// Le dice al ERP de Hammerz qué base de conocimiento lleva este agente desplegado.
//
// ## Qué problema resuelve
//
// El ERP guarda la base de conocimiento de este centro, troceada en secciones legibles. Pero la
// fuente de verdad es el `SYSTEM_PROMPT` de knowledge.js, y cuando aquí cambia algo el ERP se queda
// mintiendo sin que nada lo diga. Con esto, el ERP sabe en cada despliegue si su copia sigue siendo
// la que de verdad recibe el modelo.
//
// ## Por qué aquí sí se puede mandar el texto entero, y en el backend no
//
// `SYSTEM_PROMPT` es un único template literal sin una sola interpolación: en el momento del
// `require` ya es el string final. No hay que ejecutar nada ni inventarse datos. Por eso esta base
// se puede espejar de verdad, mientras que las plantillas de WhatsApp del backend solo admiten una
// huella (su texto se compone dentro de las funciones, con los datos de cada reserva).
//
// De momento se manda solo la huella: el ERP compara y avisa. Mandar además el texto para que se
// reimporte solo es el paso siguiente del plan, y es lo que convertirá esto en un espejo.
//
// Los marcadores `{{TODAY}}` y `{{TOMORROW_NOTE}}` se hashean SIN sustituir, a propósito: los
// sustituye server.js en cada petición, así que el texto con los marcadores dentro es el canónico —
// y es exactamente el que importó el ERP. Sustituirlos daría una huella distinta cada día y el
// aviso gritaría todas las mañanas.
const { createHash } = require('crypto')
const { SYSTEM_PROMPT } = require('./knowledge')

const HAMMERZ_ERP_URL = process.env.HAMMERZ_ERP_URL || ''
const HAMMERZ_HUELLA_SECRET = process.env.HAMMERZ_HUELLA_SECRET || ''
const HAMMERZ_CLIENT_SLUG = process.env.HAMMERZ_CLIENT_SLUG || ''

function huellaDelPrompt() {
  return createHash('sha256').update(SYSTEM_PROMPT, 'utf8').digest('hex')
}

// Mismo contrato que el resto de avisos a Hammerz: si falta configuración no hace nada, y cualquier
// fallo se registra y se sigue. El centro está haciendo pruebas de producto con clientes de verdad;
// que el ERP esté caído no puede tener ninguna consecuencia aquí.
async function publicarHuellaConocimiento() {
  if (!HAMMERZ_ERP_URL || !HAMMERZ_HUELLA_SECRET || !HAMMERZ_CLIENT_SLUG) return
  try {
    const res = await fetch(`${HAMMERZ_ERP_URL.trim()}/api/conocimiento/huella`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Hammerz-Huella-Secret': HAMMERZ_HUELLA_SECRET,
      },
      body: JSON.stringify({
        clientSlug: HAMMERZ_CLIENT_SLUG,
        service: 'agente',
        repo: 'scubacrm-agent',
        commit: process.env.RAILWAY_GIT_COMMIT_SHA || null,
        knowledgeFingerprint: huellaDelPrompt(),
      }),
    })
    if (!res.ok) {
      console.error(`[huella] el ERP respondió ${res.status}`)
      return
    }
    const cuerpo = await res.json().catch(() => null)
    const derivados = (cuerpo && cuerpo.derivados) || []
    console.log(
      '[huella] enviada al ERP' +
      (derivados.length ? ' — la base del ERP está desactualizada respecto a este prompt' : ' — todo al día'),
    )
  } catch (err) {
    console.error('[huella] no se pudo avisar al ERP:', err.message)
  }
}

module.exports = { publicarHuellaConocimiento, huellaDelPrompt }
