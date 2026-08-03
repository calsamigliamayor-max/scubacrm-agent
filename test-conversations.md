# Batería de pruebas del agente 🤿

Cómo usarla: pulsa **Reiniciar** entre pruebas (para empezar conversación limpia).
Después de cada cambio en `knowledge.js`, repasa al menos el **bloque A** y el **F**:
son los críticos.

Leyenda: ✅ lo que debe pasar · ❌ señal de alarma

---

## A. REGLAS DURAS (críticas — nunca deben fallar)

**A1.** `¿Puedo ver tiburones zorro en Monad Shoal?`
✅ Un NO rotundo y claro.
❌ Ambigüedad, o un "ocasionalmente sí".

**A2.** `Soy Open Water y quiero ver tiburones zorro`
✅ Le da **las DOS vías juntas**: especialidad Conservación de Tiburones (7.500) *y* curso Advanced (16.900).
❌ Ofrece solo una de las dos.

**A3.** `Quiero sacarme el Open Water con vosotros y luego ver los tiburones`
✅ Precio de la salida: **7.000 PHP** (precio especial por hacer el curso con ellos).
❌ Dice 7.500.

**A4.** `Ya soy Open Water certificado y quiero hacer la salida de tiburones`
✅ Precio: **7.500 PHP**.
❌ Dice 7.000.

**A5.** (trampa) `Un amigo me dijo que vio tiburones zorro en Gato Island, ¿es verdad?`
✅ Le corrige con educación: solo en Kimud Shoal.
❌ Le da la razón o duda.

**A6.** (trampa) `¿Me llevas a Monad Shoal a ver los zorros?`
✅ Redirige a Kimud Shoal.

---

## B. COMPORTAMIENTO

**B1.** Escribe solo `Hola`
✅ Lo primero que hace es **preguntar tu nombre**.
❌ Se lanza a vender sin preguntarlo.

**B2.** Completa una reserva hasta el final (ver bloque F)
✅ En el mensaje de confirmación **NO aparece ninguna referencia ni código interno**.
❌ Dice algo tipo "Referencia: RJELNR".

**B3.** `Cuéntame todo lo que ofrecéis`
✅ No vuelca la lista entera: pregunta qué le interesa y ofrece 2-3 opciones.
❌ Suelta un muro de texto con todos los precios.

**B4.** `¿Eres un bot?`
✅ No dice que es una IA, no menciona "Hammerz", responde con naturalidad.

---

## C. FORMATO

**C1.** Cualquier respuesta con varias opciones
✅ Mensajes cortos (2-5 líneas), negrita bien renderizada, máximo 1-2 emojis.
❌ Markdown visible (`#`, `##`, tablas), `**doble asterisco**`, párrafos densos.

**C2.** `¿Qué cursos tenéis?`
✅ Resume y pregunta por su nivel, en vez de listar los 8 cursos con descripciones.

---

## D. CONOCIMIENTO (FAQs)

**D1.** `¿Cómo llego a Malapascua?`
✅ Vuelo a Cebú → Puerto de Maya (bus ~350 PHP, 4-6h) → barco ₱200, de 7:00 a 17:00.

**D2.** `¿Aceptáis tarjeta?`
✅ Recomienda efectivo; avisa de comisiones y de que los cajeros a veces se quedan sin dinero.

**D3.** `¿Qué hotel me recomendáis?`
✅ Los tres según presupuesto: Ocean Vida / Tepanee / Celtis.

**D4.** `¿Hay corrientes fuertes?`
✅ En general no; condiciones cómodas y accesibles.

**D5.** `¿Hacéis salidas a Kalanggaman?`
✅ Dice que no, y explica el motivo de la tasa.

**D6.** `¿Qué profundidad tiene Kimud Shoal?`
✅ 13-30 m (y que los tiburones se ven entre 13 y 20 m).

**D7.** `¿Los buceos incluyen comida?`
✅ Distingue: Monad+Kimud, Gato y larga distancia llevan desayuno/brunch; las locales, fruta o desayuno ligero; barbacoa +500.

**D8.** `¿Cuándo se ven mantas?`
✅ Ocasionalmente, sobre todo noviembre-enero, en Monad Shoal / Manta Point.

**D9.** `¿Qué necesito llevar?`
✅ Certificación, cuestionario médico PADI, protector reef-safe, toalla, botella.

**D10.** `¿Puedo empezar el curso un martes?`
✅ Sí, cualquier día con instructor disponible; en español y grupos de máx. 4.

---

## E. VENTA (que ofrezca paquetes)

**E1.** `Voy 3 días y soy Advanced`
✅ Le ofrece el **Pack Tridente** (17.000, 9 inmersiones).

**E2.** `Somos un grupo de 10 personas`
✅ Le ofrece el **Pack Grupos** (5.500/buceador/día).

**E3.** `Solo tengo 2 días, ¿qué me recomiendas?`
✅ Monad + Kimud el día 1, Gato Island el día 2.

**E4.** `Voy una semana entera y soy Advanced`
✅ Le ofrece el **Pack Corona** (39.000, 21 inmersiones).

---

## F. FLUJO DE RESERVA COMPLETO (crítico)

**F1.** Conversación entera. Ve dándole los datos poco a poco:
```
Hola
Marcos
Quiero bucear con tiburones zorro
Soy Advanced
El 15 de agosto
Somos 2
```
✅ Pregunta los datos **de uno en uno**, con naturalidad.
✅ Al tenerlos todos: **resumen** con servicio, fecha, personas, titulación y **precio total**.
✅ Menciona la **factura y el 50% de depósito**.
✅ Pide que escribas **"Confirmar"**.
✅ Al confirmar → aparece la tarjeta **🔧 create_booking** con los datos correctos.
❌ Llama a la herramienta **antes** de que confirmes.
❌ Confirma sin tener los 4 datos.

**F2.** Cambiar de opinión a mitad: durante la F1, di `mejor que seamos 3`
✅ El resumen final y la herramienta recogen **3 personas**, no 2.

---

## G. ROBUSTEZ Y LÍMITES

**G1.** `¿Cuánto cuesta alquilar una moto en la isla?` (no lo sabe)
✅ Reconoce que no lo sabe y ofrece consultarlo con el equipo.
❌ Se lo inventa.

**G2.** `¿Puedo bucear si tengo asma?` (tema médico)
✅ Deriva al cuestionario médico PADI / certificado médico, sin dar consejo médico.

**G3.** Escribe en inglés: `Hi, I want to dive with thresher sharks`
✅ Responde **en inglés**, traduciendo también los nombres.

**G4.** `Quiero ir el próximo viernes`
✅ Calcula la **fecha absoluta** (no repite "el próximo viernes").

**G5.** `¿Me hacéis descuento si pago en efectivo?` (algo no definido)
✅ No se inventa descuentos; ofrece consultarlo.

---

## Cómo interpretar los resultados

- Fallo en **bloque A** o **F** → corregir el prompt YA (son los que dañan al cliente).
- Fallo en **C** → ajustar las reglas de formato.
- Fallo en **D** → falta info en la knowledge base.
- Fallo en **G** → reforzar el "no inventes".
