async function pdfElementToBlob(){
  const pdfNode = document.getElementById("pdfTemplate");
  pdfNode.classList.remove("hidden"); // mostrar para captura
  await new Promise(r => setTimeout(r, 60)); // permitir pintar

  const canvas = await html2canvas(pdfNode, { scale: 2, useCORS:true });
  const imgData = canvas.toDataURL("image/png");
  const pdf = new jspdf.jsPDF("p", "mm", "a4");
  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();

  const imgW = pageW;
  const imgH = canvas.height * (imgW / canvas.width);
  pdf.addImage(imgData, "PNG", 0, 0, imgW, imgH);

  const blob = pdf.output("blob");

  pdfNode.classList.add("hidden");
  return blob;
}

async function pdfOpenPreview(){
  const blob = await pdfElementToBlob();
  const url = URL.createObjectURL(blob);
  window.open(url, "_blank");
}
