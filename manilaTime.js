// Hora real de Malapascua (Filipinas, GMT+8, sin horario de verano) — independiente de en
// qué zona horaria corra el proceso de Node (Railway corre en UTC). Antes {{TODAY}} se
// calculaba con `new Date().toISOString().slice(0,10)` (fecha UTC): entre las 16:00 y las
// 23:59 UTC, Filipinas ya está en el día siguiente, así que el agente creía que era "ayer"
// durante 8 horas al día — justo la ventana que más importa para la regla de antelación
// mínima de 27/09/2026 (ver SYSTEM_PROMPT). Con Intl.DateTimeFormat se lee el reloj de pared
// de Manila directamente, sin depender de la zona del servidor.
const PH_TZ = 'Asia/Manila'

function manilaNow() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: PH_TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(new Date())
  const get = t => parts.find(p => p.type === t)?.value
  // Con hour12:false, Intl puede devolver '24' para la medianoche en vez de '00' — %24 lo corrige.
  const hour = parseInt(get('hour'), 10) % 24
  return { dateStr: `${get('year')}-${get('month')}-${get('day')}`, hour, minute: get('minute') }
}

function addDaysToDateStr(dateStr, days) {
  const d = new Date(dateStr + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

module.exports = { PH_TZ, manilaNow, addDaysToDateStr }
