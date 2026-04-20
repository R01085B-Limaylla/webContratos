let tipoMensajeSeleccionado = "";

const mensajesPorTipo = {
barman: `Hola, te saluda el Barman de LimHermanos🍸

Queremos compartirte nuestra propuesta de servicio de bar para eventos, donde ofrecemos una variedad de cócteles y mockteles preparados al momento, con una presentación cuidada y atención profesional.

Puedes ver nuestra carta completa aquí:
👉 https://www.lamarquesinacatering.live/barman.html

Será un gusto acompañarte en tu evento y resolver cualquier consulta que tengas.`,

  catering: `Hola, te saluda La Marquesina 🍽️

Te compartimos nuestro servicio de catering, donde ofrecemos diversas opciones de menús para todo tipo de eventos, combinando sabor, presentación y una experiencia de calidad.

Puedes revisar nuestro menú completo aquí:
👉 https://www.lamarquesinacatering.live/catering.html

Estamos atentos para ayudarte a encontrar la mejor opción para tu evento.`,

  ambos: `Hola, te saluda La Marquesina 🎉

Te compartimos nuestras propuestas para eventos:
✔ Servicio de catering con variedad de menús
✔ Servicio de bar con cócteles y mockteles

Puedes ver más detalles aquí:

👉 https://www.lamarquesinacatering.live/servicios.html

Será un gusto acompañarte y ayudarte a crear una excelente experiencia en tu evento.`
};

function seleccionarTipo(tipo) {
  tipoMensajeSeleccionado = tipo;

  const panel = document.getElementById("panelMensaje");
  const titulo = document.getElementById("tituloTipo");
  const descripcion = document.getElementById("descripcionTipo");
  const preview = document.getElementById("mensajePreview");
  const error = document.getElementById("msgError");

  error.textContent = "";
  document.getElementById("telefonoDestino").value = "";

  if (tipo === "barman") {
    titulo.textContent = "🍸 Mensaje para barman";
    descripcion.textContent = "Ingresa el número y abre WhatsApp con el mensaje del servicio de barman.";
  } else if (tipo === "catering") {
    titulo.textContent = "🍽️ Mensaje para catering";
    descripcion.textContent = "Ingresa el número y abre WhatsApp con el mensaje del servicio de catering.";
  } else {
    titulo.textContent = "📦 Mensaje para ambos";
    descripcion.textContent = "Ingresa el número y abre WhatsApp con el mensaje de ambos servicios.";
  }

  preview.value = mensajesPorTipo[tipo];
  panel.style.display = "block";
  panel.scrollIntoView({ behavior: "smooth", block: "start" });
}

function cerrarPanelMensaje() {
  document.getElementById("panelMensaje").style.display = "none";
  document.getElementById("msgError").textContent = "";
}

function limpiarTelefono(numero) {
  return numero.replace(/\D/g, "");
}

function normalizarTelefono(numero) {
  let limpio = limpiarTelefono(numero);

  if (limpio.length === 9) {
    return "51" + limpio;
  }

  if (limpio.length === 11 && limpio.startsWith("51")) {
    return limpio;
  }

  if (limpio.length > 11) {
    let ultimos9 = limpio.slice(-9);
    return "51" + ultimos9;
  }

  return null;
}

function enviarWhatsApp() {
  const inputTelefono = document.getElementById("telefonoDestino").value.trim();
  const error = document.getElementById("msgError");
  const mensaje = document.getElementById("mensajePreview").value.trim();

  error.textContent = "";

  if (!tipoMensajeSeleccionado) {
    error.textContent = "Primero selecciona un tipo de mensaje.";
    return;
  }

  if (!inputTelefono) {
    error.textContent = "Ingresa un número de teléfono.";
    return;
  }

  const telefonoFinal = normalizarTelefono(inputTelefono);

  if (!telefonoFinal) {
    error.textContent = "Número inválido. Ej: 999 999 999 o +51 999 999 999";
    return;
  }

  const mensajeCodificado = encodeURIComponent(mensaje);
  const url = `https://api.whatsapp.com/send?phone=${telefonoFinal}&text=${mensajeCodificado}`;
window.location.href = url;
}