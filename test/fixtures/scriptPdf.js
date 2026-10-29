// A minimal, valid PDF fixture keeps extraction tests independent of a second PDF library.
export function scriptPdfFixture(pageTexts = [["INT. CAFE - DAY", "MAYA", "We should go."]]) {
  const objects = ["<< /Type /Catalog /Pages 2 0 R >>", "", "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>"];
  const kids = [];
  for (const lines of pageTexts) {
    const pageId = objects.length + 1, streamId = pageId + 1;
    kids.push(`${pageId} 0 R`);
    const stream = lines.map((item, index) => {
      const { text, x = 40, y = 740 - index * 28 } = typeof item === "string" ? { text: item } : item;
      return `BT /F1 12 Tf ${x} ${y} Td (${text.replace(/[()\\]/g, match => `\\${match}`)}) Tj ET`;
    }).join("\n");
    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents ${streamId} 0 R >>`, `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`);
  }
  objects[1] = `<< /Type /Pages /Kids [${kids.join(" ")}] /Count ${kids.length} >>`;
  let content = "%PDF-1.4\n", offsets = [0];
  for (const [index, object] of objects.entries()) { offsets.push(Buffer.byteLength(content)); content += `${index + 1} 0 obj\n${object}\nendobj\n`; }
  const xref = Buffer.byteLength(content);
  content += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.slice(1).map(offset => `${String(offset).padStart(10, "0")} 00000 n \n`).join("")}trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(content);
}
