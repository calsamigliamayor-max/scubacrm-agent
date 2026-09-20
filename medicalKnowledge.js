// ─────────────────────────────────────────────────────────────────────────────
// BASE DE CONOCIMIENTO MÉDICA COMPARTIDA — buceo y condiciones de salud
// ─────────────────────────────────────────────────────────────────────────────
// Código BASE (sep/26): vive aquí, en Malapascua, y se copia tal cual a cualquier
// cliente nuevo — el contenido médico NO es específico de ningún centro. Si se
// actualiza aquí, hay que propagarlo a mano a los demás clientes (ver
// [[hammerz-arquitectura-multi-cliente]]).
//
// QUÉ ES: información general por categoría médica, alineada a propósito con las
// mismas 7 categorías (Cuadros A-G) + las 3 preguntas con bandera del cuestionario
// médico real que ya usa el centro (ver frontend/src/lib/medicalFormContent.js) —
// así que si un cliente pregunta algo que luego también le saldría en el
// cuestionario, la respuesta del agente y el cuestionario cuentan la misma historia.
//
// FUENTE: DAN (Divers Alert Network) — la referencia médica de buceo más citada del
// sector. Cada bloque lleva su URL exacta en el comentario, para poder verificar o
// actualizar sin tener que rehacer la búsqueda desde cero.
//
// ⚠️ REGLA DE ORO, NO NEGOCIABLE: esto es SOLO información general y educativa.
// NUNCA debe usarse para decirle a un cliente si puede o no puede bucear — esa
// decisión la toma siempre un médico que conozca su caso real. Cada vez que el
// agente use esta base, tiene que:
//   1. Dar la información general (2-4 frases, sin tecnicismos).
//   2. Recordar que Hammerz/el centro no puede dar un veredicto médico.
//   3. Recomendar consultar con un médico antes de bucear — y mencionar DAN
//      (Divers Alert Network, dan.org) como recurso especializado en medicina de
//      buceo si el cliente quiere profundizar.
//   4. NUNCA decir "puedes bucear" ni "no puedes bucear" en nombre del centro.
// ─────────────────────────────────────────────────────────────────────────────

const MEDICAL_DISCLAIMER = `IMPORTANTE: no somos médicos ni podemos evaluar tu caso — coméntalo con un médico antes de bucear. Si quieres profundizar, DAN (Divers Alert Network, dan.org) es la referencia especializada en medicina de buceo.`

// Cada entrada: identificador del cuadro/pregunta real del cuestionario (para que quien
// mantenga esto vea la correspondencia de un vistazo), palabras clave ES/EN para la
// detección rápida (ver detectMedicalQuestion), y la info general ya redactada para
// que el agente la traduzca de forma natural al idioma del cliente (mismo patrón que
// el resto del prompt: instrucciones en español, respuesta siempre en el idioma real
// del cliente).
const MEDICAL_TOPICS = [
  {
    id: 'cardio_resp', // Cuadro A: pulmones/respiración, corazón, sangre
    label: 'corazón, pulmones, asma, sangre, presión arterial',
    keywords: [
      'asma', 'asthma', 'epoc', 'copd', 'corazón', 'heart', 'cardiac', 'cardiovascular',
      'arritmia', 'arrhythmia', 'presión arterial', 'blood pressure', 'hipertensión',
      'hypertension', 'anemia', 'sangre', 'blood disorder', 'pulmones', 'lungs',
      'respirar', 'breathing problem', 'neumotórax', 'pneumothorax',
    ],
    info: `Las condiciones de corazón, pulmones o sangre son de las que más importan en buceo, porque bucear exige un sistema cardiorrespiratorio capaz de responder bien al esfuerzo y a la presión. Con asma: si está bien controlada y sin síntomas frecuentes, suele permitir bucear con evaluación médica previa; un asma con síntomas diarios normalmente no. Con el corazón, DAN distingue: una enfermedad coronaria CON síntomas (angina, etc.) es una contraindicación directa para bucear; solo tener factores de riesgo (hipertensión, colesterol, tabaco...) sin síntomas activos requiere evaluación cardiológica, no prohíbe por sí solo. Arritmias serias también exigen evaluación de un cardiólogo antes de bucear.`,
    // Fuentes: https://dan.org/health-medicine/health-resources/diseases-conditions/cardiovascular-fitness-and-diving/
    //          https://www.scubadiving.com/training/basic-skills/can-i-dive (asma, DAN ~4-5% de buceadores)
  },
  {
    id: 'age',
    label: 'edad y buceo (45+ años)',
    // "mayor" fuera a propósito: en español es una palabra demasiado genérica ("el pack
    // mayor", "somos mayoría") y disparaba el tema de edad sin venir a cuento.
    keywords: ['edad', 'age', '45 años', 'older diver', 'tercera edad', 'edad avanzada'],
    info: `Tener más de 45 años no es, por sí mismo, un impedimento para bucear — pero DAN ha medido que el riesgo de muerte por causa cardiaca buceando es hasta 10 veces mayor en mayores de 50 que en menores, así que es la edad a partir de la que se recomienda un examen médico anual (no solo puntual) antes de seguir buceando, sobre todo si hay algún factor de riesgo cardiovascular (tensión, colesterol, tabaco, antecedentes familiares...).`,
    // Fuente: https://dan.org/safety-prevention/diver-safety/divers-blog/health-concerns-for-divers-over-50/
    //         https://dan.org/health-medicine/health-resources/diseases-conditions/cardiovascular-fitness-and-diving/
  },
  {
    id: 'fitness',
    label: 'forma física / capacidad de hacer esfuerzo',
    keywords: ['forma física', 'fitness to dive', 'condición física', 'exercise tolerance', 'aptitud física'],
    info: `Bucear exige poder hacer un esfuerzo físico moderado con normalidad (el propio cuestionario médico lo mide con el ejemplo de caminar 1,6 km en 14 minutos o nadar 200 m sin parar). Si te cuesta ese nivel de esfuerzo, o si en el último año no has podido hacer actividad física normal por salud, es una señal de que conviene una evaluación médica antes de bucear.`,
  },
  {
    id: 'ears_sinus_eyes', // Cuadro C
    label: 'oídos, senos, tímpano, ojos',
    keywords: [
      'oído', 'oídos', 'ear', 'ears', 'sinus', 'sinusitis', 'seno', 'senos paranasales',
      'tímpano', 'eardrum', 'perforación', 'perforation', 'barotrauma', 'ojos', 'eyes',
      'compensar', 'equalize', 'equalise', 'presión en el oído',
    ],
    info: `Los problemas de oído/senos son la lesión de buceo más común (barotrauma por no poder igualar la presión). Regla dura de DAN: NUNCA bucear estando congestionado, ni con dolor o presión en los senos paranasales — hay que esperar a que se resuelva. Con un tímpano perforado, NUNCA se debe bucear hasta que un médico confirme que ha cicatrizado del todo Y que la trompa de Eustaquio funciona bien — bucear con la perforación abierta puede infectar el oído medio e impedir la curación (la recuperación suele tardar varios meses).`,
    // Fuente: https://dan.org/health-medicine/health-resources/diseases-conditions/tympanic-membrane-rupture-perforated-eardrum/
    //         https://dan.org/health-medicine/health-resources/diseases-conditions/sinus-barotrauma/
  },
  {
    id: 'recent_surgery',
    label: 'cirugía reciente o secuelas de una cirugía',
    keywords: ['cirugía', 'operación', 'surgery', 'operated', 'operado', 'operada'],
    info: `Tras cualquier cirugía reciente (dentro de los últimos 12 meses) o con molestias todavía activas de una cirugía anterior, lo habitual es esperar a la aprobación médica antes de volver a bucear — el tiempo de espera varía mucho según el tipo de cirugía, así que no hay una regla única.`,
  },
  {
    id: 'neuro', // Cuadro D
    label: 'epilepsia, convulsiones, migrañas, ictus, pérdida de consciencia',
    keywords: [
      'epilepsia', 'epilepsy', 'convulsión', 'convulsiones', 'seizure', 'seizures',
      'migraña', 'migraine', 'ictus', 'stroke', 'accidente cerebrovascular',
      'pérdida de conocimiento', 'loss of consciousness', 'desmayo', 'fainting',
      'lesión en la cabeza', 'head injury',
    ],
    info: `Las condiciones neurológicas con riesgo de pérdida de consciencia o de una convulsión son de las más serias en buceo, porque bajo el agua eso puede ser mortal — no hay forma de "salir a por aire" en mitad de una crisis. La guía oficial de DAN es clara y firme en esto: un diagnóstico de epilepsia es una contraindicación absoluta para bucear (otras entidades de medicina de buceo han valorado excepciones muy restringidas tras años sin episodios, pero no es la postura de DAN). Cualquier antecedente de convulsión, ictus o pérdida de consciencia necesita evaluación neurológica antes de bucear, sea cual sea el diagnóstico final.`,
    // Fuente: https://dan.org/wp-content/uploads/2021/03/Diving_Medical_Guidance_2021-01-29.pdf (Diving Medical Guidance to the Physician, DAN)
  },
  {
    id: 'psych', // Cuadro E
    label: 'ansiedad, ataques de pánico, depresión, adicciones',
    keywords: [
      'ansiedad', 'anxiety', 'ataque de pánico', 'panic attack', 'pánico',
      'depresión', 'depression', 'trastorno', 'disorder', 'psicológico', 'psychological',
      'psiquiátrico', 'psychiatric', 'adicción', 'addiction',
    ],
    info: `La ansiedad o el pánico son especialmente relevantes en buceo porque un imprevisto normal bajo el agua (una máscara que se inunda, por ejemplo) puede escalar a un pánico real y provocar una subida de emergencia peligrosa. No es un "no" automático — mucha gente con ansiedad bien manejada bucea sin problema — pero si hay un trastorno de pánico activo o tratamiento reciente, conviene comentarlo con quien lo trata antes de bucear.`,
    // Fuente: https://www.scubadiving.com/diving-doctor-anxiety-and-diving
  },
  {
    id: 'diabetes_back_other', // Cuadro F
    label: 'diabetes, espalda, hernia, úlceras',
    keywords: [
      'diabetes', 'diabético', 'diabetic', 'hernia', 'úlcera', 'ulcer', 'espalda',
      'back problem', 'dolor de espalda',
    ],
    info: `Con diabetes, el riesgo principal en buceo es que el esfuerzo físico baje el azúcar en sangre durante la inmersión, sin forma de corregirlo hasta salir. Las guías de DAN son concretas: medir la glucosa antes de cada inmersión (por encima de 80 mg/dL para empezar), volver a medirla nada más salir, y llevar siempre glucosa de acción rápida encima, en el agua y en superficie — además de que el compañero de buceo sepa reconocer una bajada. Con eso bien controlado y hablado con el médico que lleva la diabetes, no es un impedimento. Hernias o problemas de espalda no suelen impedir bucear si están controlados, pero conviene confirmarlo con quien los trata.`,
    // Fuente: https://dan.org/health-medicine/health-resource/health-safety-guidelines/guidelines-for-diabetes-and-recreational-diving/
  },
  {
    id: 'gi', // Cuadro G
    label: 'estómago, intestino, diarrea',
    keywords: ['estómago', 'intestino', 'stomach', 'intestine', 'diarrea', 'diarrhea', 'gastro'],
    info: `Problemas digestivos activos (diarrea reciente, molestias intestinales) son motivo para posponer la inmersión hasta que se resuelvan — no tanto por el buceo en sí, sino porque cualquier urgencia digestiva bajo el agua es mucho más difícil de gestionar.`,
  },
  {
    id: 'medications',
    label: 'medicación / pastillas que toma el cliente',
    keywords: [
      'medicamento', 'medicamentos', 'medication', 'medications', 'pastillas', 'pills',
      'receta', 'prescription', 'tomo medicación', 'ansiolítico', 'benzodiazepina',
      'benzodiazepine', 'antidepresivo', 'antidepressant', 'somnífero', 'sleeping pill',
      'antihistamínico', 'antihistamine', 'mareo', 'motion sickness',
    ],
    info: `Tomar medicación no impide bucear en general, pero SÍ importa cuál — DAN es tajante en esto: los sedantes, somníferos y antihistamínicos (incluidos los de venta libre para el mareo) NUNCA deben tomarse antes de bucear, porque el aumento de presión bajo el agua potencia su efecto sedante y puede provocar somnolencia real o confusión. Las benzodiazepinas en concreto están consideradas contraindicadas para bucear. Con cualquier otra medicación, la recomendación es comentarla con un médico antes de la inmersión, no asumir que es segura solo porque lo es en tierra.`,
    // Fuente: https://dan.org/health-medicine/health-resources/diseases-conditions/over-the-counter-medications/
  },
  {
    id: 'pregnancy',
    label: 'embarazo',
    keywords: ['embarazo', 'embarazada', 'pregnant', 'pregnancy', 'estoy esperando'],
    info: `La recomendación estándar (DAN) es NO bucear durante el embarazo, ni si existe la posibilidad de estarlo — no hay suficiente evidencia de que sea seguro para el feto, y los estudios disponibles apuntan a más riesgo. La alternativa segura durante el embarazo es nadar o hacer snorkel en superficie, no buceo con botella.`,
    // Fuente: https://dan.org/health-medicine/health-resources/diseases-conditions/pregnancy-and-diving/
  },
]

// Quita tildes/diéresis ("oído" → "oido", "pánico" → "panico") — en WhatsApp real la
// gente escribe sin acentos muy a menudo, y las keywords de arriba SÍ los llevan (para
// que se lean bien en el propio código). Normalizar los dos lados antes de comparar
// evita tener que mantener a mano una copia sin acento de cada palabra clave.
function stripAccents(s) {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '')
}

// Comprueba que `kw` aparece como PALABRA (no como trozo suelto de otra palabra) dentro
// de `text`. Sin el límite de palabra, una keyword corta en inglés como "ear" hacía
// falso positivo dentro de "bucEAR" — cualquier mensaje sobre buceo activaba el tema de
// oídos.
function containsKeyword(text, kw) {
  const lower = stripAccents(text.toLowerCase())
  const needle = stripAccents(kw.toLowerCase()).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const re = new RegExp(`(?<![a-z0-9])${needle}(?![a-z0-9])`)
  return re.test(lower)
}

// Detección rápida por palabras clave — mismo espíritu que la detección rápida de
// idioma en knowledge.js/server.js: barata, sin llamada a IA, y solo hace falta que
// atrape el caso común. Un falso positivo (mostrar el bloque médico sin hacer falta)
// es inofensivo; un falso negativo (no mostrarlo cuando sí hacía falta) es el riesgo
// real a evitar, así que la lista de palabras clave es deliberadamente amplia.
function detectMedicalTopics(text) {
  const t = text || ''
  return MEDICAL_TOPICS.filter(topic => topic.keywords.some(kw => containsKeyword(t, kw)))
}

// System prompt del clasificador por IA (Haiku) — capa 2, solo se llama desde server.js
// cuando la capa 1 (palabras clave) NO encontró nada, igual que detectLangAI con el
// idioma. Hace falta esta capa porque las palabras clave solo cubren español/inglés,
// pero el agente atiende en cualquier idioma, y porque una pregunta médica real puede
// venir implícita ("me cuesta respirar al hacer ejercicio") sin usar ninguna palabra de
// la lista. Sesgado a propósito hacia detectar de más: aquí un falso positivo es
// gratis, un falso negativo es el riesgo real.
function buildClassifierSystemPrompt() {
  const categories = MEDICAL_TOPICS.map(t => `- ${t.id}: ${t.label}`).join('\n')
  return (
    `Eres un clasificador. El mensaje puede estar en cualquier idioma. Decide si trata ` +
    `sobre una condición de salud, enfermedad, medicación, cirugía, embarazo o cualquier ` +
    `tema médico que pudiera afectar a si el cliente puede bucear con seguridad.\n\n` +
    `Categorías posibles:\n${categories}\n\n` +
    `Responde SOLO con el id exacto de la categoría que mejor encaje, o "otra" si es una ` +
    `pregunta médica real pero no encaja en ninguna, o "no" si el mensaje NO trata sobre ` +
    `salud/condición médica/medicación. Sin nada más, sin explicación. Ante cualquier duda ` +
    `razonable entre "no" y una categoría, elige la categoría — es peor no detectar una ` +
    `pregunta médica real que detectar una que no lo era.`
  )
}

// Construye el bloque de system prompt a partir de una lista de ids ya decididos (por
// palabras clave, por el clasificador de IA, o ambos) — "otra" incluida, para el caso de
// una pregunta médica real que no encaja en ninguna categoría concreta: ahí NO se
// inventa información — se va directo al disclaimer y a derivar al médico (ver más
// abajo, "SIN TEMA CONCRETO").
function buildMedicalSystemBlockForIds(ids) {
  const uniqueIds = [...new Set(ids)].filter(id => id && id !== 'no')
  if (uniqueIds.length === 0) return null

  const matched = MEDICAL_TOPICS.filter(t => uniqueIds.includes(t.id))
  const info = matched.map(t => `- ${t.info}`).join('\n')
  const infoBlock = info
    ? `Usa ESTA información general (tradúcela de forma natural a su idioma, no la copies literal):\n${info}`
    : `SIN TEMA CONCRETO: no tienes información catalogada para esta pregunta — NO improvises ` +
      `ni inventes nada médico. Ve directo a decirle, con cariño, que lo consulte con un médico.`

  return (
    `⚕️ El cliente ha hecho una pregunta de tipo médico. ${infoBlock}\n\n` +
    `SIGUE ESTAS REGLAS SIN EXCEPCIÓN:\n` +
    `1. ${MEDICAL_DISCLAIMER}\n` +
    `2. NUNCA le digas al cliente que "puede" o "no puede" bucear — eso lo decide un médico. ` +
    `Da la información si la tienes, y termina SIEMPRE recomendándole confirmarlo con un médico ` +
    `antes de la inmersión.\n` +
    `3. Tono: cercano y con cariño, como el resto de la conversación — pero en temas de salud, ` +
    `prioriza SIEMPRE la seguridad del cliente por encima de sonar simpático. Nunca le quites ` +
    `importancia a una pregunta médica ni la respondas con humor.`
  )
}

// Construye el bloque SOLO con la capa 1 (palabras clave) — se mantiene por si alguna
// vez hace falta el filtro rápido de forma aislada (tests, por ejemplo).
function buildMedicalSystemBlock(lastClientMessage) {
  const matched = detectMedicalTopics(lastClientMessage).map(t => t.id)
  return buildMedicalSystemBlockForIds(matched)
}

module.exports = {
  MEDICAL_TOPICS,
  MEDICAL_DISCLAIMER,
  detectMedicalTopics,
  buildMedicalSystemBlock,
  buildMedicalSystemBlockForIds,
  buildClassifierSystemPrompt,
}
