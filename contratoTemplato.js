
  function getNode(){ return document.getElementById('contrato') || document.querySelector('.page'); }

  // Escala adaptativa (reduce en pantallas pequeñas para evitar cuelgues)
  function pickScale(){
    const w = Math.min(window.innerWidth, screen.width || window.innerWidth);
    if (w <= 390) return 1.25;
    if (w <= 480) return 1.5;
    return 2; // desktop
  }

  function pdfOptionsFor(el){
    const w = el.clientWidth, h = el.clientHeight;
    return {
      margin: 0,
      image: { type: 'jpeg', quality: 0.98 },
      html2canvas: { scale: pickScale(), useCORS: true, scrollX: 0, scrollY: 0 },
      jsPDF: { unit: 'px', format: [w, h], orientation: 'portrait' }
    };
  }


  function mostrarPopupLoading() {
  const popup = document.getElementById('popupLoading');
  if (popup) popup.classList.remove('hidden');
}

function ocultarPopupLoading() {
  const popup = document.getElementById('popupLoading');
  if (popup) popup.classList.add('hidden');
}

  async function downloadPdfA4(){
  mostrarPopupLoading();

  try {
    const el = getNode();
    const opt = pdfOptionsFor(el);
    await html2pdf().set({ ...opt, filename: 'Contrato.pdf' }).from(el).save();
  } finally {
    ocultarPopupLoading();
  }
}

async function openPdfA4(){
  mostrarPopupLoading();

  const holder = window.open('about:blank');
  if (!holder) {
    ocultarPopupLoading();
    alert('Permite las ventanas emergentes para abrir el PDF.');
    return;
  }

  try {
    holder.document.write('<html><body style="font-family:sans-serif;padding:20px">Generando PDF…</body></html>');
    const el = getNode();
    const opt = pdfOptionsFor(el);
    const worker = html2pdf().set(opt).from(el).toPdf();
    const pdf = await worker.get('pdf');
    const blob = pdf.output('blob');
    const url = URL.createObjectURL(blob);
    holder.location.href = url;
    setTimeout(()=>URL.revokeObjectURL(url), 60000);
  } catch (e) {
    holder.close();
    alert('No se pudo abrir el PDF. ' + e.message);
  } finally {
    ocultarPopupLoading();
  }
}

async function sharePdfA4(){
  mostrarPopupLoading();

  try {
    const el = getNode();
    const opt = pdfOptionsFor(el);
    const worker = html2pdf().set(opt).from(el).toPdf();
    const pdf = await worker.get('pdf');
    const blob = pdf.output('blob');
    const file = new File([blob], 'Contrato.pdf', { type:'application/pdf' });

    if (navigator.canShare?.({ files:[file] })) {
      await navigator.share({ title:'Contrato — La Marquesina', files:[file] });
      return;
    }

    const url = URL.createObjectURL(blob);
    const w = window.open(url, '_blank');

    if (!w) {
      const a = document.createElement('a');
      a.href = url;
      a.download = 'Contrato.pdf';
      document.body.appendChild(a);
      a.click();
      a.remove();
    }

    setTimeout(()=>URL.revokeObjectURL(url), 60000);
  } finally {
    ocultarPopupLoading();
  }
}