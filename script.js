// === Configura Supabase ===
const SUPABASE_URL = "https://pfjhrnxhqhzvqaviasjm.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBmamhybnhocWh6dnFhdmlhc2ptIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjExNzg1MDksImV4cCI6MjA3Njc1NDUwOX0.O9hP-Uh64pDwY4xCcGOYaz9Oi0xARxAbL1PJgCJyLr4";

const supabase = window.supabase.createClient(
  SUPABASE_URL,
  SUPABASE_ANON_KEY,
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
      storage: localStorage, // fuerza localStorage
    },
  }
);

// opcional: lo exponemos también en window por si lo quieres usar desde consola
window.supabaseClient = supabase;


// Asegura ADMINS global en todas las páginas
window.ADMINS = (window.ADMINS && window.ADMINS.length)
  ? window.ADMINS
  : [
      "rosario@lamarquesina.pe",
      "sebastian@lamarquesina.pe",
      "sujey@lamarquesina.pe",
      "paulmarcos@lamarquesina.pe"
    ];

// === Helpers de sesión / auth ===
async function getSession() {
  const { data } = await supabaseClient.auth.getSession();
  return data.session;
}
async function protectPage({ softRetry = true } = {}) {
  const admins = window.ADMINS.map((x) => x.toLowerCase());

  let session = (await supabaseClient.auth.getSession()).data?.session;
  if (!session && softRetry) {
    for (let i = 0; i < 20; i++) { // ~2s
      await new Promise((r) => setTimeout(r, 100));
      session = (await supabaseClient.auth.getSession()).data?.session;
      if (session) break;
    }
  }

  if (!session) {
    console.warn("[protectPage] sin sesión, regreso a login");
    location.href = "index.html";
    return;
  }

  const email = (session.user?.email || "").toLowerCase();
  if (!admins.includes(email)) {
    console.warn("[protectPage] email no admin:", email, admins);
    await supabaseClient.auth.signOut();
    location.href = "index.html";
  }
}


async function logout() {
  await supabaseClient.auth.signOut();
  location.href = "index.html";
}

function setupLogin() {
  const form = document.getElementById("loginForm");
  const emailEl = document.getElementById("email");
  const passEl = document.getElementById("password");
  const errEl = document.getElementById("loginError");

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    errEl.textContent = "";

    const email = (emailEl.value || "").trim().toLowerCase();
    const admins = window.ADMINS.map((x) => x.toLowerCase());
    if (!admins.includes(email)) {
      errEl.textContent = "No tienes permiso para acceder.";
      return;
    }

    // 1) Intento de login
    const { data, error } = await supabaseClient.auth.signInWithPassword({
      email,
      password: passEl.value,
    });
    if (error) {
      console.error("[SUPABASE LOGIN ERROR]", error);
      errEl.textContent = error.message || "Error al iniciar sesión.";
      return;
    }

    // 2) Espera cambio de estado de auth (fiable)
    const ok = await waitAuthStateChanged(2000); // hasta 2s
    if (!ok) {
      // 3) Fallback: polling a getSession por si el evento no llegó aún
      const ok2 = await waitForSession({ retries: 30, intervalMs: 100 });
      if (!ok2) {
        errEl.textContent = "No se pudo establecer sesión. Reintenta.";
        return;
      }
    }

    location.href = "dashboard.html";
    console.log("[LOGIN] sesión confirmada, redirigiendo…");

  });
}

function waitAuthStateChanged(timeoutMs = 1500) {
  return new Promise((resolve) => {
    let done = false;
    const timer = setTimeout(() => {
      if (!done) resolve(false);
    }, timeoutMs);

    const { data: sub } = supabaseClient.auth.onAuthStateChange((_event, sess) => {
      if (sess && !done) {
        done = true;
        clearTimeout(timer);
        sub.subscription.unsubscribe();
        resolve(true);
      }
    });
  });
}

async function waitForSession({ retries = 30, intervalMs = 100 } = {}) {
  for (let i = 0; i < retries; i++) {
    const { data } = await supabaseClient.auth.getSession();
    if (data?.session) return true;
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  return false;
}


// Espera hasta que getSession devuelva una sesión real
async function waitForSession({ retries = 30, intervalMs = 100 } = {}) {
  for (let i = 0; i < retries; i++) {
    const { data } = await supabaseClient.auth.getSession();
    if (data?.session) return true;
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  return false;
}


// === UI Redactar: dinámica y cálculo ===
(function initRedactarPage(){
  const tipo = document.getElementById("tipo");
  const serviciosBarman = document.getElementById("serviciosBarman");
  const serviciosCatering = document.getElementById("serviciosCatering");
  const firmaCatering = document.getElementById("firmaCatering");
  const firmaBarman = document.getElementById("firmaBarman");
  const firmaAmbos = document.getElementById("firmaAmbos");
  const total = document.getElementById("total");
  const adelanto = document.getElementById("adelanto");
  const resta = document.getElementById("resta");

  if (!tipo) return; // no estamos en redactar

  const refreshTipo = () => {
    const t = tipo.value;
    serviciosBarman.classList.toggle("hidden", !(t === "barman" || t === "ambos"));
    serviciosCatering.classList.toggle("hidden", !(t === "catering" || t === "ambos"));

    firmaCatering.classList.toggle("hidden", t !== "catering");
    firmaBarman.classList.toggle("hidden", t === "catering");
    firmaAmbos.classList.toggle("hidden", t !== "ambos");
  };
  tipo.addEventListener("change", refreshTipo);
  refreshTipo();

  const recalc = () => {
    const t = parseFloat(total.value||"0");
    const a = parseFloat(adelanto.value||"0");
    const r = Math.max(t - a, 0);
    resta.value = r.toFixed(2);
  };
  total?.addEventListener("input", recalc);
  adelanto?.addEventListener("input", recalc);
})();

// === Guardar contrato ===
async function saveContract() {
  const tipo = document.getElementById("tipo").value;
  const adelanto = parseFloat(document.getElementById("adelanto").value||"0");
  const total = parseFloat(document.getElementById("total").value||"0");
  const resta = parseFloat(document.getElementById("resta").value||"0");
  const movilidad = document.getElementById("movilidad").checked;
  const fecha = document.getElementById("fecha").value;
  const hora = document.getElementById("hora").value;
  const direccion = document.getElementById("direccion").value;
  const referencia = document.getElementById("referencia").value;
  const contratante = document.getElementById("contratante").value;
  const dni = document.getElementById("dni").value;

  // Servicios seleccionados
  const barmanChecks = [...document.querySelectorAll(".barmanCheck:checked")].map(x=>x.value);
  const varCoctel = [...document.querySelectorAll(".varCoctel:checked")].map(x=>x.value);
  const coctelesTipo = document.getElementById("coctelesTipo").value;

  const cateringChecks = [...document.querySelectorAll(".cateringCheck:checked")].map(x=>x.value);
  const colorPlatos = document.getElementById("colorPlatos")?.value || "";
  const colorServilletas = document.getElementById("colorServilletas")?.value || "";
  const cantidadCatering = parseInt(document.getElementById("cantidadCatering")?.value||"0");
  const platosDescripcion = document.getElementById("platosDescripcion")?.value || "";
  const firmaCateringSelect = document.getElementById("firmaCateringSelect")?.value || "";

  // Llenar plantilla PDF
  fillPdfTemplate({
    tipo, adelanto, total, resta, movilidad, fecha, hora, direccion, referencia,
    contratante, dni,
    barmanChecks, coctelesTipo, varCoctel,
    cateringChecks, colorPlatos, colorServilletas, cantidadCatering, platosDescripcion,
    firmaCateringSelect
  });

  // 1) Generar PDF (Blob)
  const blob = await pdfElementToBlob();

  // 2) Subir a storage
  const fileName = `${Date.now()}_${tipo}_${contratante.replace(/\s+/g,'_')}.pdf`;
  const { data: up, error: upErr } = await supabaseClient.storage
    .from("contracts-pdf")
    .upload(`contracts/${fileName}`, blob, { contentType: "application/pdf", upsert: false });
  if (upErr) {
    document.getElementById("saveErr").textContent = "Error al subir PDF: " + upErr.message;
    return;
  }
  const pdf_url = `${SUPABASE_URL}/storage/v1/object/public/${up.path}`;

  // 3) Guardar registro en tabla
  const { error: dbErr } = await supabaseClient.from("contracts").insert([{
    type: tipo,
    services: {
      barmanChecks, varCoctel, coctelesTipo,
      cateringChecks, colorPlatos, colorServilletas, cantidadCatering, platosDescripcion
    },
    adelanto, precio_total: total, resta,
    fecha_evento: fecha, hora_evento: hora,
    direccion, referencia,
    firma: (tipo==="catering") ? firmaCateringSelect : (tipo==="barman" ? "Rosario y Sebastian" : "Contratante"),
    contratante, dni_contratante: dni,
    pdf_url, storage_path: up.path, movilidad
  }]);
  if (dbErr) {
    document.getElementById("saveErr").textContent = "Error al guardar en DB: " + dbErr.message;
    return;
  }

  document.getElementById("saveErr").textContent = "";
  const ok = document.getElementById("saveMsg");
  ok.classList.remove("hidden");
  setTimeout(()=>ok.classList.add("hidden"), 1800);
}

// === Listar contratos (ver.html) ===
async function loadContracts() {
  const list = document.getElementById("list");
  const err = document.getElementById("listErr");
  if (!list) return;

  const { data, error } = await supabaseClient
    .from("contracts")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    err.textContent = "Error al cargar contratos: " + error.message;
    return;
  }

  list.innerHTML = "";
  data.forEach(row => {
    const el = document.createElement("div");
    el.className = "card contract";
    el.innerHTML = `
      <h3>${row.type.toUpperCase()}</h3>
      <div class="meta">${row.contratante} — DNI: ${row.dni_contratante}</div>
      <div class="meta">Fecha: ${row.fecha_evento || "-"} ${row.hora_evento || ""}</div>
      <div class="meta">Resta: S/. ${(row.resta||0).toFixed ? row.resta.toFixed(2) : row.resta}</div>
      <div class="actions">
        <a class="btn" href="${row.pdf_url}" target="_blank" rel="noopener">Descargar PDF</a>
        <button class="btn" onclick="prefillAndGoEdit('${row.id||""}')"
          disabled title="(simple) Edición directa no incluida — re-redacta y guarda sobre el existente">
          Editar
        </button>
        <button class="btn danger" onclick="deleteContract('${row.id}','${row.storage_path||""}')">Eliminar</button>
      </div>
    `;
    list.appendChild(el);
  });
}

// (Opcional) Demo para flujo de edición simple
function prefillAndGoEdit(id){
  alert("Para edición simple, vuelve a Redactar y guarda un nuevo PDF. (Se puede implementar edición completa si lo deseas.)");
}

// Eliminar contrato (DB + (opcional) storage)
async function deleteContract(id, storagePath){
  if (!confirm("¿Eliminar este contrato?")) return;
  // 1) borrar registro
  const { error } = await supabaseClient.from("contracts").delete().eq("id", id);
  if (error) { alert("Error al borrar en DB: " + error.message); return; }
  // 2) borrar archivo (opcional)
  if (storagePath) {
    await supabaseClient.storage.from("contracts-pdf").remove([storagePath]);
  }
  // recargar
  loadContracts();
}

// === Plantilla PDF ===
function fillPdfTemplate(data){
  // Texto principal
  document.getElementById("pdfTipo").textContent = data.tipo.toUpperCase();
  document.getElementById("pdfAdelanto").textContent = (data.adelanto||0).toFixed(2);
  document.getElementById("pdfServicioLabel").textContent = (data.tipo==="catering"?"Catering":(data.tipo==="ambos"?"Catering y Barman":"Barman"));
  document.getElementById("pdfContratante").textContent = data.contratante;
  document.getElementById("pdfDNI").textContent = data.dni;

  // Servicios
  const list = document.getElementById("pdfServicios");
  list.innerHTML = "";
  if (data.tipo === "barman" || data.tipo==="ambos") {
    data.barmanChecks.forEach(s => addLi(list, s));
    addLi(list, `Cocteles en ${data.coctelesTipo}${data.varCoctel.length?": "+data.varCoctel.join(", "):""}`);
  }
  if (data.tipo === "catering" || data.tipo==="ambos") {
    data.cateringChecks.forEach(s => addLi(list, s));
    if (data.cateringChecks.includes("Platos de sitio")) addLi(list, `Platos de sitio (color: ${data.colorPlatos})`);
    if (data.cateringChecks.includes("Servilletas")) addLi(list, `Servilletas (color: ${data.colorServilletas})`);
    if (data.cantidadCatering>0) addLi(list, `Cantidad: ${data.cantidadCatering}`);
    if (data.platosDescripcion) addLi(list, `Platos: ${data.platosDescripcion}`);
  }

  // Rubros / totales
  const rubros = (data.tipo==="barman") ? "Cocteles" : (data.tipo==="catering" ? "Platos" : "Cocteles y Platos");
  document.getElementById("pdfRubros").textContent = rubros + ` — Total S/. ${data.total.toFixed(2)}`;
  document.getElementById("pdfMovilidad").textContent = data.movilidad ? "Sí" : "No";
  document.getElementById("pdfAdelanto2").textContent = data.adelanto.toFixed(2);
  document.getElementById("pdfResta").textContent = data.resta.toFixed(2);

  // Evento
  document.getElementById("pdfCoctelesComida").textContent = (data.tipo==="barman") ? "Cocteles" : (data.tipo==="catering" ? "Comida" : "Cocteles y comida");
  document.getElementById("pdfFecha").textContent = formatFecha(data.fecha);
  document.getElementById("pdfHora").textContent = data.hora;
  document.getElementById("pdfDireccion").textContent = data.direccion;
  const refWrap = document.getElementById("pdfRefWrap");
  if (data.referencia) {
    document.getElementById("pdfRef").textContent = ": " + data.referencia;
    refWrap.classList.remove("hidden");
  } else {
    refWrap.classList.add("hidden");
  }

  // Firmas visibles según tipo
  const firmaSebWrap = document.getElementById("firmaSebastianWrap");
  const firmaSujWrap = document.getElementById("firmaSujeyWrap");
  const firmaCtrWrap = document.getElementById("firmaContratanteWrap");
  firmaSebWrap.classList.add("hidden");
  firmaSujWrap.classList.add("hidden");
  firmaCtrWrap.classList.add("hidden");

  if (data.tipo === "barman") {
    // Rosario y Sebastián
    firmaSebWrap.classList.remove("hidden");
  } else if (data.tipo === "catering") {
    // Solo Rosario o Sujey
    if (data.firmaCateringSelect === "Sujey") firmaSujWrap.classList.remove("hidden");
  } else if (data.tipo === "ambos") {
    // espacio para firma del contratante
    document.getElementById("firmaContratanteNombre").textContent = data.contratante;
    document.getElementById("firmaContratanteDni").textContent = data.dni;
    firmaCtrWrap.classList.remove("hidden");
    // por defecto mantenemos la firma de Rosario visible
  }
}
function addLi(ul, text){ const li=document.createElement("li"); li.textContent=text; ul.appendChild(li); }
function formatFecha(iso){
  if (!iso) return "";
  const d = new Date(iso+"T00:00:00");
  const dias = ["Domingo","Lunes","Martes","Miércoles","Jueves","Viernes","Sábado"];
  const meses = ["enero","febrero","marzo","abril","mayo","junio","julio","agosto","septiembre","octubre","noviembre","diciembre"];
  return `${dias[d.getDay()]} ${d.getDate()} de ${meses[d.getMonth()]} de ${d.getFullYear()}`;
}

// Vista previa PDF en nueva pestaña (opcional)
async function previewPDF(){
  await pdfOpenPreview();
}

function descargarContrato() {
  const element = document.querySelector(".contract-page");
  const opt = {
    margin: 0,
    filename: "Contrato-La-Marquesina.pdf",
    image: { type: "jpeg", quality: 0.98 },
    html2canvas: { scale: 2 },
    jsPDF: { unit: "mm", format: "a4", orientation: "portrait" }
  };
  html2pdf().set(opt).from(element).save();
}
