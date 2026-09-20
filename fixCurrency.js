// Red de seguridad genérica (20/09/2026, generalizada a partir de un parche puntual que
// solo existía en el agente de Galápagos Travellers — ver mapa-consolidacion-config.md):
// el modelo a veces escribe la moneda de OTRO centro en texto libre (notas, nota de un
// día de un pack a medida) — arrastre de con qué otro centro se entrenó/probó el prompt.
// El prompt (knowledge.js) ya insiste en la moneda real, pero un texto libre nunca da
// garantía al 100%; esto la da de verdad, sin depender de que el modelo se acuerde.
//
// Clave para que esto sea portable a un centro nuevo sin romper el que ya cobra en su
// propia moneda: la corrección se hace CONTRA `centerCurrency.js` (la moneda real de ESTE
// centro, ver ese archivo) — nunca hardcodeada a una moneda fija. Si el modelo ya escribe
// la moneda correcta, esta función no toca nada.
const CENTER_CURRENCY = require('./centerCurrency')

// Monedas que el modelo podría escribir por error. Añadir aquí cualquier otra que se
// observe en producción en un centro nuevo.
const KNOWN_CURRENCIES = [
  { code: 'PHP', symbol: '₱' },
  { code: 'USD', symbol: '$' },
  { code: 'EUR', symbol: '€' },
]

function fixCurrency(text) {
  if (!text) return text
  let fixed = text
  for (const cur of KNOWN_CURRENCIES) {
    if (cur.code === CENTER_CURRENCY.code) continue // la moneda real de este centro nunca se toca
    fixed = fixed.replace(new RegExp(`\\b${cur.code}\\b`, 'g'), CENTER_CURRENCY.code)
    if (cur.symbol !== CENTER_CURRENCY.symbol) fixed = fixed.split(cur.symbol).join(CENTER_CURRENCY.symbol)
  }
  return fixed
}

module.exports = { fixCurrency, CENTER_CURRENCY }
