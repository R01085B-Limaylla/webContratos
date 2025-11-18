// ===== Config de esta página =====
const BUCKET = "contratos-pdf";
const TABLE_NAME = "contratos";

// ===== Helpers =====
function formatoFechaCorta(iso) {
  if (!iso) return "Fecha no registrada";
  const [y, m, d] = iso.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  return date.toLocaleDateString("es-PE", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function formatoMoneda(valor) {
  if (valor == null || isNaN(valor)) return "S/. 0.00";
  return "S/. " + Number(valor).toFixed(2);
}

function verPdf(url) {
  if (!url || url === "#") {
    alert("Este contrato aún no tiene PDF asociado.");
    return;
  }
  window.open(url, "_blank");
}

function editarContrato(id) {
  // Redirige a redactar con el id para que esa página lo cargue y rellene
  window.location.href = `./redactar.html?contratoId=${id}`;
}

async function eliminarContrato(id, pdfPath) {
  if (!confirm("¿Seguro que deseas eliminar este contrato?")) return;

  const { error: dbErr } = await supabase
    .from(TABLE_NAME)
    .delete()
    .eq("id", id);

  if (dbErr) {
    alert("Error al eliminar el contrato.");
    console.error(dbErr);
    return;
  }

  if (pdfPath) {
    const { error: stErr } = await supabase
      .storage
      .from(BUCKET)
      .remove([pdfPath]);

    if (stErr) {
      console.warn("Contrato borrado, pero hubo problema eliminando el PDF:", stErr);
    }
  }

  cargarContratos();
}

// ===== Cargar contratos y pintar tarjetas =====
async function cargarContratos() {
  const contenedor = document.getElementById("listaContratos");
  const estado = document.getElementById("estadoLista");
  const err = document.getElementById("listErr");

  err.textContent = "";
  contenedor.innerHTML = "";
  estado.textContent = "Cargando contratos…";

  const { data, error } = await supabase
    .from(TABLE_NAME)
    .select("*")
    .order("fecha_evento", { ascending: true, nullsFirst: false });

  if (error) {
    estado.textContent = "";
    err.textContent =
      "Error al cargar contratos: " + (error.message || JSON.stringify(error));
    console.error("Supabase error al cargar contratos:", error);
    return;
  }

  if (!data || !data.length) {
    estado.textContent = "No hay contratos registrados todavía.";
    return;
  }

  estado.textContent = `Mostrando ${data.length} contrato(s).`;

  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);

  const cards = data.map((c) => {
    const { data: pub } = supabase
      .storage
      .from(BUCKET)
      .getPublicUrl(c.pdf_path || "");

    const pdfUrl = (pub && pub.publicUrl) ? pub.publicUrl : "#";

    const p = c.payload || {};
    const tipoLower = (c.tipo || "").toLowerCase();

    // ===== Fecha / hora =====
    let fechaEventStr = c.fecha_evento || p.fecha || null;
    let fechaObj = null;
    if (fechaEventStr && /^\d{4}-\d{2}-\d{2}$/.test(fechaEventStr)) {
      const [y, m, d] = fechaEventStr.split("-").map(Number);
      fechaObj = new Date(y, m - 1, d);
      fechaObj.setHours(0, 0, 0, 0);
    }

    const fechaTexto =
      p.fechaTexto || (fechaEventStr ? formatoFechaCorta(fechaEventStr) : "Fecha no registrada");

    let horaTexto = "";
    if (p.horaIndefinida) {
      horaTexto = "Hora por definir";
    } else if (p.horaTexto) {
      horaTexto = p.horaTexto;
    }

    const fechaHoraLine = horaTexto
      ? `${fechaTexto} — ${horaTexto}`
      : fechaTexto;

    const isExpired = fechaObj && fechaObj < hoy;

    // ===== Dirección =====
    const direccion = c.direccion || p.direccion || "Sin dirección registrada";

    // ===== Adelanto / Resta =====
    const adelanto = formatoMoneda(c.adelanto);
    const resta = formatoMoneda(c.resta);

    // ===== Extras =====
    let extrasText = p.extras || "";
    if (!extrasText && Array.isArray(p.servicios)) {
      const exItem = p.servicios.find((s) => /^Extras:/i.test(s));
      if (exItem) extrasText = exItem.replace(/^Extras:\s*/i, "").trim();
    }

    // ===== DETALLE CATERING =====
    let cateringBlock = "";
    if (tipoLower === "catering" || tipoLower === "ambos") {
      const partesCat = [];
      const servicios = Array.isArray(p.servicios) ? p.servicios : [];

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
        partesCat.push(`<p class="contract-line">Cantidad: ${cantPlatos}</p>`);
      }

      // Comida
      const comida = p.platosDescripcion || (() => {
        const hit = servicios.find((s) => /^Comida:/i.test(s));
        if (hit) return hit.replace(/^Comida:\s*/i, "").trim();
        return "";
      })();
      if (comida) {
        partesCat.push(`<p class="contract-line">Comida: ${comida}</p>`);
      }

      // Detalles: solo los ítems pedidos
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
        partesCat.push(
          `<p class="contract-line">Detalles: ${detItems.join(" · ")}</p>`
        );
      }

      // Extras
      if (extrasText) {
        partesCat.push(
          `<p class="contract-line">Extras: ${extrasText}</p>`
        );
      }

      if (partesCat.length) {
        cateringBlock = `
          <div class="contract-block">
            <p class="contract-line"><strong>🍽 Catering</strong></p>
            ${partesCat.join("")}
          </div>
        `;
      }
    }

    // ===== DETALLE COCTELES (BARMAN) =====
    let barmanBlock = "";
    if (tipoLower === "barman" || tipoLower === "ambos") {
      const servicios = Array.isArray(p.servicios) ? p.servicios : [];
      const co = p.cocteles || {};
      const partesBar = [];

      // Cantidad de cocteles con detalle de tipo de vaso
      let textoCantidad = "";

      if (co.modo === "total" && co.total) {
        const vajilla = (co.tipoVajilla || "").toLowerCase();

        if (vajilla === "acrílico" || vajilla === "acrilico") {
          textoCantidad = `${co.total} Acrílico`;
        } else if (vajilla === "cristalería" || vajilla === "cristaleria") {
          textoCantidad = `${co.total} Cristalería`;
        } else {
          textoCantidad = String(co.total);
        }
      } else if (co.modo === "separado") {
        const a = Number(co.acrilico || 0);
        const r = Number(co.cristaleria || 0);
        const partesCant = [];
        if (a) partesCant.push(`${a} Acrílico`);
        if (r) partesCant.push(`${r} Cristalería`);
        textoCantidad = partesCant.join(" · ");
      }

      if (textoCantidad) {
        partesBar.push(
          `<p class="contract-line">Cantidad: ${textoCantidad}</p>`
        );
      }

      // Cocteles (variedades)
      const variedades =
        Array.isArray(co.variedades) && co.variedades.length
          ? co.variedades.join(", ")
          : "";
      if (variedades) {
        partesBar.push(
          `<p class="contract-line">Cocteles: ${variedades}</p>`
        );
      }

      // Detalles coctel: solo Ayudante de barra / Barra móvil
      const detCoItems = [];
      servicios.forEach((s) => {
        const t = s.trim();
        if (/^Ayudante de barra$/i.test(t) || /^Barra móvil$/i.test(t)) {
          detCoItems.push(t);
        }
      });
      if (detCoItems.length) {
        partesBar.push(
          `<p class="contract-line">Detalles coctel: ${detCoItems.join(" · ")}</p>`
        );
      }

      // Extras
      if (extrasText) {
        partesBar.push(
          `<p class="contract-line">Extras: ${extrasText}</p>`
        );
      }

      if (partesBar.length) {
        barmanBlock = `
          <div class="contract-block">
            <p class="contract-line"><strong>🍹 Cocteles</strong></p>
            ${partesBar.join("")}
          </div>
        `;
      }
    }

    const tipoContrato = (c.tipo || "Sin tipo").toUpperCase();
    const cliente = c.cliente || "Sin nombre";

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
          <p class="contract-line">📅 ${fechaHoraLine}</p>
          <p class="contract-line">📍 ${direccion}</p>
          <p class="contract-line">
            💰 Adelanto: <strong>${adelanto}</strong>
            &nbsp;—&nbsp;
            Resta: <strong>${resta}</strong>
          </p>

          ${cateringBlock}
          ${barmanBlock}
          ${expiredNote}
        </div>

        <footer class="contract-actions">
          <button class="btn ghost" onclick="verPdf('${pdfUrl}')">
            📄 Ver / Imprimir PDF
          </button>
          <button class="btn outline" onclick="editarContrato(${c.id})">
            ✏️ Editar
          </button>
          <button class="btn danger" onclick="eliminarContrato(${c.id}, '${c.pdf_path || ""}')">
            🗑️ Eliminar
          </button>
        </footer>
      </article>
    `;
  });

  contenedor.innerHTML = cards.join("");
}

// Ejecutar al cargar la página
window.addEventListener("load", cargarContratos);
