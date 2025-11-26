// popups-loader.js
async function loadPopups() {
  const container = document.getElementById("popups-root");
  if (!container) return;

  try {
    const res = await fetch("./popups.html");
    if (!res.ok) throw new Error("No se pudo cargar popups.html");
    const html = await res.text();
    container.innerHTML = html;
  } catch (e) {
    console.error("[loadPopups] Error cargando popups:", e);
  }
}

// Cargar al iniciar la página
document.addEventListener("DOMContentLoaded", loadPopups);
