// wa-bot/server.js
// Bot WhatsApp (texto) -> SOLO VISUALIZAR contratos desde Supabase (tabla: "contratos")
// Soporta sinónimos: contratos / ver contratos / eventos / ver eventos / reservas / etc.

// Requisitos:
// npm i express axios @supabase/supabase-js dotenv
// node >= 18  (o usa "type":"module" en package.json)

import express from "express";
import axios from "axios";
import "dotenv/config";
import { createClient } from "@supabase/supabase-js";

const app = express();
app.use(express.json({ limit: "2mb" }));

// ====== CONFIG ======
const PORT = process.env.PORT || 3000;
const WA_API_BASE = process.env.WA_API_BASE || "https://graph.facebook.com/v20.0";
const WA_PHONE_NUMBER_ID = process.env.WA_PHONE_NUMBER_ID;
const WA_ACCESS_TOKEN = process.env.WA_ACCESS_TOKEN;
const WA_VERIFY_TOKEN = process.env.WA_VERIFY_TOKEN;

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Si tu tabla "contratos" NO tiene user_id (en tu captura no aparece), el bot filtrará por DNI.
// Para eso, tu tabla "whatsapp_users" debe tener la columna "dni".
const CONTRACTS_TABLE = "contratos";
const CONTRACTS_HAVE_USER_ID = (process.env.CONTRACTS_HAVE_USER_ID || "false").toLowerCase() === "true";

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// ====== HELPERS ======
function norm(s) {
  return (s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function isListContractsCommand(text) {
  const t = norm(text);

  const patterns = [
    // contratos
    /^contratos?$/,
    /^(ver|mostrar|lista|listar|dame|muestrame)\s+contratos?$/,
    /^mis\s+contratos?$/,
    // eventos
    /^eventos?$/,
    /^(ver|mostrar|lista|listar|dame|muestrame)\s+eventos?$/,
    /^mis\s+eventos?$/,
    // reservas
    /^reservas?$/,
    /^(ver|mostrar|lista|listar|dame|muestrame)\s+reservas?$/,
    /^mis\s+reservas?$/,
    // catering (por si lo usan como sinónimo)
    /^catering$/,
    /^(ver|mostrar|lista|listar)\s+catering$/,
  ];

  return patterns.some((r) => r.test(t));
}

function money(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return "—";
  return `S/. ${x.toFixed(2)}`;
}

function fmtDate(dt) {
  if (!dt) return "—";
  // fecha_evento es DATE (YYYY-MM-DD)
  const d = new Date(`${dt}T00:00:00`);
  return d.toLocaleDateString("es-PE", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function safePayload(payload) {
  try {
    if (!payload) return null;
    if (typeof payload === "string") return JSON.parse(payload);
    if (typeof payload === "object") return payload;
    return null;
  } catch {
    return null;
  }
}

function pick(obj, keys, fallback = "—") {
  for (const k of keys) {
    const v = obj?.[k];
    if (v !== undefined && v !== null && String(v).trim() !== "") return v;
  }
  return fallback;
}

// ✅ REEMPLAZA tu contratoCard por este (replica el orden de tu ver.js, sin duplicar, y separa Catering/Cocteles en AMBOS)
function contratoCard(c) {
  const p = safePayload(c.payload) || {};
  const tipoLower = String(p.tipo || c.tipo || "").toLowerCase();

  const hasText = (v) => v !== null && v !== undefined && String(v).trim() !== "" && String(v).trim() !== "—";
  const toNum = (v) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };
  const hasNum = (v) => {
    const n = toNum(v);
    return n !== null && n !== 0;
  };
  const join = (arr) => arr.filter(Boolean).join("\n");

  function horaLabel(texto, indef) {
    if (indef) return "Hora por definir";
    if (!texto) return null;
    return texto;
  }

  function buildCantidadCoctelesText(p) {
    const co = p.cocteles || {};
    if (!co) return null;

    if (co.modo === "separado") {
      const parts = [];
      if (co.acrilico) parts.push(`${co.acrilico} Acrílico`);
      if (co.cristaleria) parts.push(`${co.cristaleria} Cristalería`);
      return parts.length ? parts.join(" · ") : null;
    }

    if (co.modo === "total") {
      if (co.tipoVajilla === "Acrílico") return `${co.total || 0} Acrílico`;
      if (co.tipoVajilla === "Cristalería") return `${co.total || 0} Cristalería`;
      return String(co.total || 0);
    }

    return null;
  }

  // ===== Header (como tu web) =====
  const tipoContrato = String(p.tipo || c.tipo || "Sin tipo").toUpperCase();
  const cliente = c.cliente || p.cliente || "Sin nombre";
  const dniCliente = c.dni || p.dniCliente || null;

  const fechaTxt = p.fechaTexto || (c.fecha_evento ? fmtDate(c.fecha_evento) : "—");

  // En cabecera: si es catering/barman mostramos fecha + su hora; si es ambos, SOLO fecha (como tu ver.js)
  let fechaLinea = fechaTxt;

  if (tipoLower === "catering") {
    const hCom = horaLabel(p.horaComidaTexto, p.horaComidaIndefinida);
    if (hasText(hCom)) fechaLinea += `, ${hCom}`;
  } else if (tipoLower === "barman") {
    const hCock = horaLabel(p.horaCoctelTexto, p.horaCoctelIndefinida);
    if (hasText(hCock)) fechaLinea += `, ${hCock}`;
  }

  const direccion = c.direccion || p.direccion || "Sin dirección registrada";
  const referencia = c.referencia || p.referencia || null;

  const adelanto = c.adelanto ?? p.adelanto;
  const resta = c.resta ?? p.resta;
  const total = c.total ?? p.total;

  // Extras (igual que tu web: p.extras o desde servicios "Extras:")
  let extrasText = p.extras || "";
  const serviciosArr = Array.isArray(p.servicios) ? p.servicios.map(s => String(s).trim()).filter(Boolean) : [];

  if (!extrasText) {
    const exItem = serviciosArr.find((s) => /^Extras:/i.test(s));
    if (exItem) extrasText = exItem.replace(/^Extras:\s*/i, "").trim();
  }
  const extrasLine = hasText(extrasText) ? `✨ *Extras:* ${extrasText}` : null;

  // Movilidad (solo si está prendida y monto > 0, igual que tu web)
  const movOn = !!p.movOn;
  const movMonto = toNum(p.movilidadMonto || 0);
  const movilidadLine = (movOn && movMonto && movMonto !== 0) ? `🚐 *Movilidad:* ${money(movMonto)}` : null;

  // ===== Bloque Catering (igual lógica que buildCateringBlock) =====
  function buildCateringText(p, extrasText) {
    const tipo = String(p.tipo || "").toLowerCase();
    if (tipo !== "catering" && tipo !== "ambos") return null;

    const partes = [];

    const hora = horaLabel(p.horaComidaTexto, p.horaComidaIndefinida);
    partes.push(`🍽️ *Catering:* ${hora || "—"}`);

    // Cantidad de platos: usa cantidadCatering o busca "Cantidad de platos: X"
    let cantPlatos = p.cantidadCatering;
    if (!cantPlatos) {
      const hitCant = serviciosArr.find((s) => /^Cantidad de platos:\s*\d+/i.test(s));
      if (hitCant) {
        const m = hitCant.match(/Cantidad de platos:\s*(\d+)/i);
        if (m) cantPlatos = m[1];
      }
    }
    if (hasText(cantPlatos)) partes.push(`*Cantidad:* ${cantPlatos}`);

    // Comida: platosDescripcion o busca "Comida: ..."
    const comida = p.platosDescripcion || (() => {
      const hit = serviciosArr.find((s) => /^Comida:/i.test(s));
      return hit ? hit.replace(/^Comida:\s*/i, "").trim() : "";
    })();
    if (hasText(comida)) partes.push(`*Comida:* ${comida}`);

    // Detalles catering (solo estos items, igual que tu web)
    const detItems = [];
    serviciosArr.forEach((s) => {
      if (
        /^Platos de sitio/i.test(s) ||
        /^Servilletas/i.test(s) ||
        /^Copas$/i.test(s.trim()) ||
        /^Cubiertos dorados$/i.test(s.trim()) ||
        /^Mozos:\s*\d+/i.test(s) ||
        /^Mesas:\s*\d+/i.test(s)
      ) detItems.push(s.trim());
    });
    if (detItems.length) partes.push(`*Detalles:* ${detItems.join(" · ")}`);

    if (hasText(extrasText)) partes.push(`*Extras:* ${extrasText}`);

    return partes.join("\n");
  }

  // ===== Bloque Cocteles (igual lógica que buildCoctelesBlock) =====
  function buildCoctelesText(p, extrasText) {
    const tipo = String(p.tipo || "").toLowerCase();
    if (tipo !== "barman" && tipo !== "ambos") return null;

    const partes = [];
    const hora = horaLabel(p.horaCoctelTexto, p.horaCoctelIndefinida);
    partes.push(`🍹 *Cocteles:* ${hora || "—"}`);

    // Cantidad (usa tu buildCantidadCocteles)
    const cantTxt = buildCantidadCoctelesText(p);
    if (hasText(cantTxt) && cantTxt !== "0" && cantTxt !== "0 Acrílico" && cantTxt !== "0 Cristalería") {
      partes.push(`*Cantidad:* ${cantTxt}`);
    }

    // Variedades
    const co = p.cocteles || {};
    const variedades = Array.isArray(co.variedades) && co.variedades.length ? co.variedades.join(", ") : "";
    if (hasText(variedades)) partes.push(`*Cocteles:* ${variedades}`);

    // Detalles coctel: solo Ayudante de barra, Barra móvil (igual que tu web)
    const detCo = [];
    serviciosArr.forEach((s) => {
      const t = s.trim();
      if (/^Ayudante de barra$/i.test(t) || /^Barra móvil$/i.test(t)) detCo.push(t);
    });
    if (detCo.length) partes.push(`*Detalles coctel:* ${detCo.join(" · ")}`);

    if (hasText(extrasText)) partes.push(`*Extras:* ${extrasText}`);

    return partes.join("\n");
  }

  const cateringBlock = buildCateringText(p, extrasText);
  const coctelesBlock = buildCoctelesText(p, extrasText);

  // ===== Subtotales (solo donde corresponde, sin repetir) =====
  // En tu web no lo muestras como “Subtotales”, así que lo oculto por defecto.
  // Si quieres mostrarlo, dímelo y lo activamos por tipo.

  return join([
    `📄 *${tipoContrato}*  (#${c.id})`,
    `👤 *Cliente:* ${cliente}`,
    hasText(dniCliente) ? `🪪 *DNI (cliente):* ${dniCliente}` : null,
    `📅 ${fechaLinea}`,
    `📍 ${direccion}`,
    hasText(referencia) ? `📌 Ref: ${referencia}` : null,
    `💰 *Adelanto:* ${money(adelanto)}  —  *Resta:* ${money(resta)}  —  *Total:* ${money(total)}`,
    movilidadLine,
    cateringBlock ? `\n${cateringBlock}` : null,
    coctelesBlock ? `\n${coctelesBlock}` : null,
    // Extras ya están dentro de cada bloque en tu web; si quieres que SOLO salgan dentro de bloques, comenta la línea de abajo:
    // extrasLine,
  ]).trim();
}




function splitWhatsApp(text, max = 3500) {
  const parts = [];
  let buf = "";
  for (const line of text.split("\n")) {
    if ((buf ? buf.length : 0) + line.length + 1 > max) {
      if (buf) parts.push(buf);
      buf = line;
    } else {
      buf = buf ? `${buf}\n${line}` : line;
    }
  }
  if (buf) parts.push(buf);
  return parts;
}

async function sendText(to, body) {
  const url = `${WA_API_BASE}/${WA_PHONE_NUMBER_ID}/messages`;
  await axios.post(
    url,
    {
      messaging_product: "whatsapp",
      to,
      text: { body },
    },
    {
      headers: {
        Authorization: `Bearer ${WA_ACCESS_TOKEN}`,
        "Content-Type": "application/json",
      },
      timeout: 15000,
    }
  );
}

// ====== SUPABASE ACCESS ======
async function getLinkedUser(phone) {
  // Recomendado: tabla whatsapp_users(phone PK, user_id uuid NULL, dni text NULL, verified bool)
  const { data, error } = await supabase
    .from("whatsapp_users")
    .select("phone, user_id, dni, verified")
    .eq("phone", phone)
    .maybeSingle();

  if (error) throw error;
  return data; // null si no está vinculado
}

// ✅ ORDEN POR FECHA MÁS PRÓXIMA ARRIBA (ya lo haces igual que ver.js)
async function listContractsForLinked(linked) {
  const { data, error } = await supabase
    .from("contratos")
    .select(`
      id,tipo,cliente,dni,fecha_evento,direccion,referencia,total,adelanto,resta,payload,fecha_creado
    `)
    .order("fecha_evento", { ascending: true, nullsFirst: false })
    .limit(10);

  if (error) throw error;
  return data || [];
}



// ====== WEBHOOKS ======
app.get("/webhook", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token === WA_VERIFY_TOKEN) return res.status(200).send(challenge);
  return res.sendStatus(403);
});

app.post("/webhook", async (req, res) => {
  try {
    const entry = req.body?.entry?.[0];
    const changes = entry?.changes?.[0]?.value;
    const msg = changes?.messages?.[0];

    if (!msg) return res.sendStatus(200);

    const from = String(msg.from || "").trim(); // wa_id (sin +)
    const text = (msg.text?.body || "").trim();

    const linked = await getLinkedUser(from);

    if (!linked || !linked.verified) {
      await sendText(
        from,
        "❌ Tu número no está vinculado.\n" +
          "Pídele al admin que te registre en la tabla *whatsapp_users*.\n" +
          "Luego escribe: *contratos*"
      );
      return res.sendStatus(200);
    }

    // ✅ Y PARA QUE ENVÍE 1 MENSAJE POR CONTRATO (ya sin juntar todo)
// Reemplaza tu bloque de "listar contratos" por este:
if (isListContractsCommand(text)) {
  const contratos = await listContractsForLinked(linked);

  if (!contratos.length) {
    await sendText(from, "No hay contratos registrados.");
    return res.sendStatus(200);
  }

  await sendText(from, `🗂️ *Tus contratos (${contratos.length})*`);

  for (const c of contratos) {
    const msg = contratoCard(c);
    for (const part of splitWhatsApp(msg)) await sendText(from, part);
  }

  return res.sendStatus(200);
}


    await sendText(
      from,
      "Comandos:\n" +
        "- *contratos*\n" +
        "- *ver contratos*\n" +
        "- *eventos*\n" +
        "- *reservas*"
    );
    return res.sendStatus(200);
  } catch (e) {
    console.error("Webhook error:", e?.response?.data || e);
    return res.sendStatus(200);
  }
});

app.listen(PORT, () => {
  console.log(`WA bot running on port ${PORT}`);
});
