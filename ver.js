
// ===== Config de esta página =====
const BUCKET = "contratos-pdf";
const TABLE_NAME = "contratos";


// ===== Helpers =====
function formatMoney(valor) {
  if (valor == null || isNaN(valor)) return "S/. 0.00";
  return "S/. " + Number(valor).toFixed(2);
}

function formatFechaLarga(iso, fallbackTexto) {
  if (fallbackTexto) return fallbackTexto;
  if (!iso) return "Fecha no registrada";
  const [y, m, d] = iso.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  return date.toLocaleDateString("es-PE", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function horaLabel(texto, indef) {
  if (indef) return "Hora por definir";
  if (!texto) return "—";
  return texto;
}

function verPdf(url) {
  if (!url || url === "#") {
    alert("Este contrato aún no tiene PDF asociado.");
    return;
  }

  // 🌐 Si estamos en la app Android (WebView con puente nativo)
  if (window.AndroidBridge && typeof AndroidBridge.openPdfUrl === "function") {
    AndroidBridge.openPdfUrl(url);  // 👈 le pasamos la URL al puente nativo
    return;
  }

  // 💻 En navegador normal (PC): abrir en nueva pestaña
  try {
    const w = window.open(url, "_blank");
    if (!w) {
      // Popup bloqueado: último recurso → misma pestaña
      window.location.href = url;
    }
  } catch (e) {
    window.location.href = url;
  }
}



function editarContrato(id) {
  window.location.href = `./redactar.html?contratoId=${id}`;
}

async function eliminarContrato(id, pdfPath) {
  const { error: dbErr } = await supabaseClient.from(TABLE_NAME).delete().eq("id", id);

  if (dbErr) {
    alert("Error al eliminar el contrato.");
    console.error(dbErr);
    return;
  }

  if (pdfPath) {
  const { error: stErr } = await supabaseClient.storage.from(BUCKET).remove([pdfPath]);

    if (stErr) {
      console.warn("Contrato borrado, pero hubo problema eliminando el PDF:", stErr);
    }
  }

  cargarContratos();
}


// ===== Bloques específicos =====
function buildMovilidadLine(p) {
  if (!p.movOn) return "";
  const monto = Number(p.movilidadMonto || 0);
  if (!monto) return "";
  return `<p class="contract-line">🚐 <strong>Movilidad:</strong> ${formatMoney(monto)}</p>`;
}

function buildCateringBlock(p, extrasText) {
  const tipo = (p.tipo || "").toLowerCase();
  if (tipo !== "catering" && tipo !== "ambos") return "";

  const servicios = Array.isArray(p.servicios) ? p.servicios : [];
  const partes = [];

  // Hora comida
  const hora = horaLabel(p.horaComidaTexto, p.horaComidaIndefinida);
  partes.push(
    `<p class="contract-line"><span class="emoji">🍽</span> <strong>Catering:</strong> ${hora}</p>`
  );

  // Cantidad de platos
  let cantPlatos = p.cantidadCatering;
  if (!cantPlatos) {
    const hitCant = servicios.find((s) =>
      /^Cantidad de platos:\s*\d+/i.test(s)
    );
    if (hitCant) {
      const m = hitCant.match(/Cantidad de platos:\s*(\d+)/i);
      if (m) cantPlatos = m[1];
    }
  }
  if (cantPlatos) {
    partes.push(`<p class="contract-line"><strong>Cantidad:</strong> ${cantPlatos}</p>`);
  }

  // Comida
  const comida = p.platosDescripcion || (() => {
    const hit = servicios.find((s) => /^Comida:/i.test(s));
    return hit ? hit.replace(/^Comida:\s*/i, "").trim() : "";
  })();
  if (comida) {
    partes.push(`<p class="contract-line"><strong>Comida:</strong> ${comida}</p>`);
  }

  // Detalles: Platos de sitio, Servilletas, Copas, Cubiertos dorados, Mozos, Mesas
  const detItems = [];
  servicios.forEach((s) => {
    if (
      /^Platos de sitio/i.test(s) ||
      /^Servilletas/i.test(s) ||
      /^Copas$/i.test(s.trim()) ||
      /^Cubiertos dorados$/i.test(s.trim()) ||
      /^Mozos:\s*\d+/i.test(s) ||
      /^Mesas:\s*\d+/i.test(s)
    ) {
      detItems.push(s);
    }
  });
  if (detItems.length) {
    partes.push(
      `<p class="contract-line"><strong>Detalles:</strong> ${detItems.join(" · ")}</p>`
    );
  }

  // Extras
  if (extrasText) {
    partes.push(
      `<p class="contract-line"><strong>Extras:</strong> ${extrasText}</p>`
    );
  }

  return `
    <div class="contract-block catering-block">
      ${partes.join("")}
    </div>
  `;
}

function buildCantidadCocteles(p) {
  const co = p.cocteles || {};
  if (!co) return "";

  if (co.modo === "separado") {
    const parts = [];
    if (co.acrilico) parts.push(`${co.acrilico} Acrílico`);
    if (co.cristaleria) parts.push(`${co.cristaleria} Cristalería`);
    return parts.join(" · ");
  }

  if (co.modo === "total") {
    if (co.tipoVajilla === "Acrílico") {
      return `${co.total || 0} Acrílico`;
    }
    if (co.tipoVajilla === "Cristalería") {
      return `${co.total || 0} Cristalería`;
    }
    return String(co.total || 0);
  }

  return "";
}

function buildCoctelesBlock(p, extrasText) {
  const tipo = (p.tipo || "").toLowerCase();
  if (tipo !== "barman" && tipo !== "ambos") return "";

  const servicios = Array.isArray(p.servicios) ? p.servicios : [];
  const co = p.cocteles || {};
  const partes = [];

  // Hora cocteles
  const hora = horaLabel(p.horaCoctelTexto, p.horaCoctelIndefinida);
  partes.push(
    `<p class="contract-line"><span class="emoji">🍹</span> <strong>Cocteles:</strong> ${hora}</p>`
  );

  // Cantidad
  const cantTxt = buildCantidadCocteles(p);
  if (cantTxt) {
    partes.push(`<p class="contract-line"><strong>Cantidad:</strong> ${cantTxt}</p>`);
  }

  // Variedades
  const variedades =
    Array.isArray(co.variedades) && co.variedades.length
      ? co.variedades.join(", ")
      : "";
  if (variedades) {
    partes.push(
      `<p class="contract-line"><strong>Cocteles:</strong> ${variedades}</p>`
    );
  }

  // Detalles coctel: Ayudante de barra, Barra móvil
  const detCo = [];
  servicios.forEach((s) => {
    const t = s.trim();
    if (/^Ayudante de barra$/i.test(t) || /^Barra móvil$/i.test(t)) {
      detCo.push(t);
    }
  });
  if (detCo.length) {
    partes.push(
      `<p class="contract-line"><strong>Detalles coctel:</strong> ${detCo.join(" · ")}</p>`
    );
  }

  // Extras
  if (extrasText) {
    partes.push(
      `<p class="contract-line"><strong>Extras:</strong> ${extrasText}</p>`
    );
  }

  return `
    <div class="contract-block barman-block">
      ${partes.join("")}
    </div>
  `;
}

// ===== Cargar contratos y pintar tarjetas =====
async function cargarContratos() {
  const contenedor = document.getElementById("listaContratos");
  const estado = document.getElementById("estadoLista");
  const err = document.getElementById("listErr");

  if (!contenedor) return;

  err.textContent = "";
  contenedor.innerHTML = "";
  if (estado) estado.textContent = "Cargando contratos…";

  const { data, error } = await supabaseClient
  .from(TABLE_NAME)
  .select("*")
  .order("fecha_evento", { ascending: true, nullsFirst: false });

  if (error) {
    if (estado) estado.textContent = "";
    err.textContent =
      "Error al cargar contratos: " + (error.message || JSON.stringify(error));
    console.error("Supabase error al cargar contratos:", error);
    return;
  }

  if (!data || !data.length) {
    if (estado) estado.textContent = "No hay contratos registrados todavía.";
    return;
  }

  if (estado) estado.textContent = `Mostrando ${data.length} contrato(s).`;

  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);

  const cards = data.map((c) => {
    // URL pública del PDF
    const { data: pub } = supabaseClient.storage.from(BUCKET).getPublicUrl(c.pdf_path || "");


    const pdfUrl = (pub && pub.publicUrl) ? pub.publicUrl : "#";

    const p = c.payload || {};
    const tipoLower = (p.tipo || c.tipo || "").toLowerCase();

    // Fecha evento
    const fechaEventStr = c.fecha_evento || p.fecha || null;
    let fechaObj = null;
    if (fechaEventStr && /^\d{4}-\d{2}-\d{2}$/.test(fechaEventStr)) {
      const [y, m, d] = fechaEventStr.split("-").map(Number);
      fechaObj = new Date(y, m - 1, d);
      fechaObj.setHours(0, 0, 0, 0);
    }
    const fechaTexto = formatFechaLarga(fechaEventStr, p.fechaTexto);
    const isExpired = fechaObj && fechaObj < hoy;

    // Línea de fecha + hora, según tipo
let fechaLinea = fechaTexto;

if (tipoLower === "catering") {
  // usar hora de comida
  const hCom = horaLabel(p.horaComidaTexto, p.horaComidaIndefinida);
  if (hCom && hCom !== "—") {
    fechaLinea += ` , ${hCom}`;
  }
} else if (tipoLower === "barman") {
  // usar hora de cocteles
  const hCock = horaLabel(p.horaCoctelTexto, p.horaCoctelIndefinida);
  if (hCock && hCock !== "—") {
    fechaLinea += ` , ${hCock}`;
  }
}
// en "ambos" dejamos solo la fecha en la cabecera (las horas ya se ven en los bloques 🍽 y 🍹)


    // Dirección
    const direccion = c.direccion || p.direccion || "Sin dirección registrada";

    // Adelanto / Resta
    const adelanto = formatMoney(c.adelanto ?? p.adelanto);
    const resta    = formatMoney(c.resta ?? p.resta);

    // Extras
    let extrasText = p.extras || "";
    if (!extrasText && Array.isArray(p.servicios)) {
      const exItem = p.servicios.find((s) => /^Extras:/i.test(s));
      if (exItem) extrasText = exItem.replace(/^Extras:\s*/i, "").trim();
    }

    // Movilidad
    const movilidadLine = buildMovilidadLine(p);

    // Bloques Catering / Cocteles
    const cateringBlock  = buildCateringBlock(p, extrasText);
    const coctelesBlock  = buildCoctelesBlock(p, extrasText);

    // Tipo y cliente
    const tipoContrato = (p.tipo || c.tipo || "Sin tipo").toUpperCase();
    const cliente = c.cliente || p.cliente || "Sin nombre";

    const expiredNote = isExpired
      ? `<p class="contract-expired-note">⚠ Este contrato ya pasó de fecha. Te recomendamos eliminarlo.</p>`
      : "";

    return `
      <article class="contract-card ${isExpired ? "contract-card--expired" : ""}">
        <header class="contract-card-header">
          <div>
            <h3 class="contract-type">${tipoContrato}</h3>
            <p class="contract-client">Cliente: ${cliente}</p>
          </div>
        </header>

        <div class="contract-body">
          <p class="contract-line">📅 ${fechaLinea}</p>
          <p class="contract-line">📍 ${direccion}</p>
          <p class="contract-line">
            💰 <strong>Adelanto:</strong> ${adelanto}
            &nbsp;—&nbsp;
            <strong>Resta:</strong> ${resta}
          </p>
          ${movilidadLine}
          ${cateringBlock}
          ${coctelesBlock}
          ${expiredNote}
        </div>

        <footer class="contract-actions">
        <button class="btn ghost" onclick="openVerPdfPopup('${pdfUrl}')">
          📄 Ver / Imprimir PDF
        </button>
        <button class="btn outline" onclick="openEditarPopup(${c.id})">
          ✏️ Editar
        </button>
        <button class="btn danger" onclick="openEliminarPopup(${c.id}, '${c.pdf_path || ""}')">
          🗑️ Eliminar
        </button>
      </footer>

      </article>
    `;
  });

  contenedor.innerHTML = cards.join("");
}

window.addEventListener("load", cargarContratos);
