// One-time build script that turned the raw firm template
// (Ressources/JLPa_NOTE-VISITE-CHANTIER.docx) into public/templates/note-visite-chantier.docx
// by injecting docxtemplater tags at specific byte offsets in the original OOXML.
// Kept for provenance/reference if the source template ever needs re-tagging —
// not part of the app's runtime build. To re-run: unzip the original docx into
// docx-extract/extracted next to this script, run this file, then repackage with
// repackage-docx.cjs.
import fs from "node:fs";

const ROOT = "docx-extract/extracted/word";

function applyEdits(xml, edits) {
  // Apply from highest offset to lowest so earlier offsets stay valid.
  const sorted = [...edits].sort((a, b) => b.start - a.start);
  let out = xml;
  for (const e of sorted) {
    if (e.end < e.start) throw new Error(`bad edit ${JSON.stringify(e)}`);
    const before = out.slice(0, e.start);
    const after = out.slice(e.end);
    out = before + e.text + after;
  }
  return out;
}

function t(content) {
  return `<w:t xml:space="preserve">${content}</w:t>`;
}

// ---------- document.xml ----------
let doc = fs.readFileSync(`${ROOT}/document.xml`, "utf8");

const zoneHeaderRow =
  '<w:tr w:rsidR="00B40539" w14:paraId="7A000001" w14:textId="77777777" w:rsidTr="00DF1603">' +
  '<w:tc><w:tcPr><w:tcW w:w="7560" w:type="dxa"/><w:tcMar><w:left w:w="0" w:type="dxa"/><w:bottom w:w="0" w:type="dxa"/><w:right w:w="360" w:type="dxa"/></w:tcMar></w:tcPr>' +
  '<w:p><w:pPr><w:spacing w:before="120" w:line="240" w:lineRule="auto"/><w:rPr><w:b/><w:sz w:val="19"/><w:szCs w:val="19"/><w:u w:val="single"/></w:rPr></w:pPr>' +
  '<w:r><w:rPr><w:b/><w:sz w:val="19"/><w:szCs w:val="19"/><w:u w:val="single"/></w:rPr>' + t("{#zones}{zoneName}") + "</w:r></w:p></w:tc>" +
  '<w:tc><w:tcPr><w:tcW w:w="2160" w:type="dxa"/><w:tcMar><w:left w:w="0" w:type="dxa"/><w:bottom w:w="0" w:type="dxa"/><w:right w:w="0" w:type="dxa"/></w:tcMar></w:tcPr>' +
  '<w:p><w:pPr><w:spacing w:before="120" w:line="240" w:lineRule="auto"/></w:pPr></w:p></w:tc></w:tr>';

const itemRow =
  '<w:tr w:rsidR="00B40539" w14:paraId="7A000002" w14:textId="77777777" w:rsidTr="00DF1603">' +
  '<w:tc><w:tcPr><w:tcW w:w="7560" w:type="dxa"/><w:tcMar><w:left w:w="0" w:type="dxa"/><w:bottom w:w="0" w:type="dxa"/><w:right w:w="360" w:type="dxa"/></w:tcMar></w:tcPr>' +
  '<w:p><w:pPr><w:spacing w:before="40" w:after="40" w:line="240" w:lineRule="auto"/><w:rPr><w:sz w:val="19"/><w:szCs w:val="19"/></w:rPr></w:pPr>' +
  '<w:r><w:rPr><w:sz w:val="19"/><w:szCs w:val="19"/></w:rPr>' + t("{#items}{number}. {text}") + "</w:r></w:p></w:tc>" +
  '<w:tc><w:tcPr><w:tcW w:w="2160" w:type="dxa"/><w:tcMar><w:left w:w="0" w:type="dxa"/><w:bottom w:w="0" w:type="dxa"/><w:right w:w="0" w:type="dxa"/></w:tcMar></w:tcPr>' +
  '<w:p><w:pPr><w:spacing w:before="40" w:after="40" w:line="240" w:lineRule="auto"/><w:rPr><w:sz w:val="19"/><w:szCs w:val="19"/></w:rPr></w:pPr>' +
  '<w:r><w:rPr><w:sz w:val="19"/><w:szCs w:val="19"/></w:rPr>' + t("{actionBy}{/items}{/zones}") + "</w:r></w:p></w:tc></w:tr>";

function photoCell(width, marginRight, openTag, closeTag) {
  return (
    `<w:tc><w:tcPr><w:tcW w:w="${width}" w:type="dxa"/><w:tcMar><w:top w:w="115" w:type="dxa"/><w:left w:w="115" w:type="dxa"/><w:bottom w:w="115" w:type="dxa"/><w:right w:w="${marginRight}" w:type="dxa"/></w:tcMar></w:tcPr>` +
    `<w:p><w:pPr><w:spacing w:line="240" w:lineRule="auto"/><w:jc w:val="center"/></w:pPr>` +
    `<w:r>${t(openTag)}</w:r>` +
    `<w:r>${t("{%image}")}</w:r>` +
    `<w:r>${t(closeTag)}</w:r>` +
    `</w:p></w:tc>`
  );
}

function captionCell(width, marginRight, openTag, closeTag) {
  return (
    `<w:tc><w:tcPr><w:tcW w:w="${width}" w:type="dxa"/><w:tcMar><w:top w:w="58" w:type="dxa"/><w:left w:w="115" w:type="dxa"/><w:bottom w:w="58" w:type="dxa"/><w:right w:w="${marginRight}" w:type="dxa"/></w:tcMar></w:tcPr>` +
    `<w:p><w:pPr><w:spacing w:line="240" w:lineRule="auto"/><w:jc w:val="center"/><w:rPr><w:sz w:val="19"/><w:szCs w:val="19"/></w:rPr></w:pPr>` +
    `<w:r><w:rPr><w:sz w:val="19"/><w:szCs w:val="19"/></w:rPr>${t(openTag)}</w:r>` +
    `<w:r><w:br/></w:r>` +
    `<w:r><w:rPr><w:sz w:val="19"/><w:szCs w:val="19"/></w:rPr>${t(closeTag)}</w:r>` +
    `</w:p></w:tc>`
  );
}

const photoImageRow =
  '<w:tr w:rsidR="00091D56" w14:paraId="7A000003" w14:textId="77777777" w:rsidTr="00706138">' +
  photoCell(3236, 115, "{#photoRows}{#photo1}", "{/photo1}") +
  photoCell(3236, 115, "{#photo2}", "{/photo2}") +
  photoCell(3236, 115, "{#photo3}", "{/photo3}") +
  "</w:tr>";

const photoCaptionRow =
  '<w:tr w:rsidR="00706138" w14:paraId="7A000004" w14:textId="77777777" w:rsidTr="00091D56">' +
  captionCell(3236, 115, "{#photo1}{caption}", "({number}){/photo1}") +
  captionCell(3236, 115, "{#photo2}{caption}", "({number}){/photo2}") +
  captionCell(3236, 115, "{#photo3}{caption}", "({number}){/photo3}{/photoRows}") +
  "</w:tr>";

const docEdits = [
  // Title box
  { start: 4485, end: 4499, text: t("{noteNumber}") },
  // NB PAGES / TRANSMIS PAR / DATE value row
  { start: 8742, end: 8754, text: t("{pageCount}") },
  { start: 10171, end: 10190, text: t("{transmittedBy}") },
  { start: 11343, end: 11369, text: t("{date}") },
  // PROJET / NO DOSSIER
  { start: 14352, end: 14378, text: t("{projectTitle}") },
  { start: 15100, end: 15473, text: t("{#dossierNumbers}{label} : {number}{/dossierNumbers}") },
  { start: 16248, end: 16263, text: t("{owner}") },
  // ENTREPRENEUR block
  { start: 19162, end: 19551, text: t("{contractorContactNameTitle}") },
  { start: 20037, end: 20067, text: t("{contractorCompany}") },
  { start: 20553, end: 20970, text: t("{contractorAddress}") },
  { start: 21456, end: 21479, text: t("{contractorPhone}") },
  { start: 21915, end: 21934, text: t("{contractorEmail}") },
  // DISTRIBUTION: entry 1 becomes the loop template
  { start: 23728, end: 23740, text: t("{#distribution}☐ ") },
  { start: 23942, end: 24000, text: t("{name}, {company}{/distribution}") },
  // DISTRIBUTION: delete duplicate entries 2-5 (paragraphs 23-26)
  { start: 24012, end: 28939, text: "" },
  // CONDITIONS CLIMATIQUES / HEURE / DATE value row
  { start: 32493, end: 32522, text: t("{weather}") },
  { start: 33254, end: 33277, text: t("{time}") },
  { start: 34363, end: 34389, text: t("{date}") },
  // OBJET
  { start: 35517, end: 35563, text: t("{subject}") },
  // ASSISTAIENT: row 11 (37518-41094) becomes the loop template
  { start: 38411, end: 38432, text: t("{#attendees}{name}") },
  { start: 39272, end: 39292, text: t("{company}") },
  { start: 40132, end: 40148, text: t("{title}") },
  { start: 41048, end: 41068, text: t("{initials}{/attendees}") },
  // ASSISTAIENT: delete duplicate rows 12-15
  { start: 41094, end: 54682, text: "" },
  // GÉNÉRALITÉS ET AVANCEMENT notes: collapse to one bound paragraph
  { start: 56418, end: 56459, text: t("{generalNotes}") },
  { start: 56471, end: 58490, text: "" },
  // OBSERVATIONS ET ACTIONS: replace the giant single row with the zone/item loop rows
  { start: 61227, end: 100268, text: zoneHeaderRow + itemRow },
  // PHOTOS: rows 18-19 become the photoRows loop template
  { start: 101471, end: 106831, text: photoImageRow },
  { start: 106831, end: 108616, text: photoCaptionRow },
  // PHOTOS: delete the other two duplicate row-pairs
  { start: 108616, end: 123577, text: "" },
];

doc = applyEdits(doc, docEdits);

// The "☐" checkboxes in the DISTRIBUTION list are real Word checkbox content
// controls (<w:sdt>), not literal text. The loop's opening tag ends up inside
// the sdt while the closing tag sits outside it, which docxtemplater rejects
// as an invalid loop position. Replace the whole sdt with a plain run.
{
  const idx = doc.indexOf("{#distribution}");
  const sdtStart = doc.lastIndexOf("<w:sdt>", idx);
  const sdtEnd = doc.indexOf("</w:sdt>", idx) + "</w:sdt>".length;
  if (idx === -1 || sdtStart === -1 || sdtEnd === "</w:sdt>".length - 1) {
    throw new Error("distribution sdt fixup: expected markers not found");
  }
  const replacement =
    '<w:r><w:rPr><w:rFonts w:cs="Arial"/><w:spacing w:val="4"/><w:sz w:val="17"/><w:szCs w:val="17"/></w:rPr>' +
    '<w:t xml:space="preserve">{#distribution}☐ </w:t></w:r>';
  doc = doc.slice(0, sdtStart) + replacement + doc.slice(sdtEnd);
}

fs.writeFileSync(`${ROOT}/document.xml`, doc, "utf8");
console.log("document.xml rewritten, new length:", doc.length);

// ---------- footer2.xml ----------
let footer2 = fs.readFileSync(`${ROOT}/footer2.xml`, "utf8");
footer2 = applyEdits(footer2, [
  { start: 6947, end: 6961, text: t("{noteNumber}") },
  { start: 7423, end: 7449, text: t("{projectTitle}") },
  { start: 7988, end: 8003, text: t("{primaryDossierNumber}") },
]);
fs.writeFileSync(`${ROOT}/footer2.xml`, footer2, "utf8");
console.log("footer2.xml rewritten");

// ---------- footer3.xml ----------
let footer3 = fs.readFileSync(`${ROOT}/footer3.xml`, "utf8");
footer3 = applyEdits(footer3, [{ start: 7566, end: 7594, text: t("{preparedByNameTitle}") }]);
fs.writeFileSync(`${ROOT}/footer3.xml`, footer3, "utf8");
console.log("footer3.xml rewritten");
