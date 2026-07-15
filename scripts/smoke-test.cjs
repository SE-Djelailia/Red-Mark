const fs = require("node:fs");
const PizZip = require("pizzip");
const Docxtemplater = require("docxtemplater");
const ImageModule = require("docxtemplater-image-module-free");

const templatePath = process.argv[2];
const outPath = process.argv[3];

const content = fs.readFileSync(templatePath, "binary");
const zip = new PizZip(content);

// 1x1 red pixel PNG, just to exercise the image module end-to-end.
const pixelPng = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64",
);

const imageModule = new ImageModule({
  centered: false,
  getImage: () => pixelPng,
  getSize: () => [120, 90],
});

const doc = new Docxtemplater(zip, {
  paragraphLoop: true,
  linebreaks: true,
  modules: [imageModule],
});

const data = {
  noteNumber: "A001",
  pageCount: "3",
  transmittedBy: "Courriel",
  date: "29 janvier 2025",
  projectTitle: "Projet de test",
  dossierNumbers: [
    { label: "JLPa", number: "4279" },
    { label: "SQI", number: "425222" },
  ],
  owner: "SQI",
  contractorContactNameTitle: "Jean Test, Directeur",
  contractorCompany: "Groupe Test inc.",
  contractorAddress: "123 rue Test, Ville, QC",
  contractorPhone: "514-000-0000",
  contractorEmail: "test@example.com",
  distribution: [
    { name: "Alice Dupont", company: "Client Inc" },
    { name: "Bob Martin", company: "Ingenieur Inc" },
  ],
  weather: "Ensoleille, 5 C",
  time: "9h00 - 10h00",
  subject: "Visite de chantier / constatations.",
  attendees: [
    { name: "Jean Test", company: "JLP", title: "Architecte", initials: "JT" },
    { name: "Marie Dupuis", company: "Client", title: "Chargee de projet", initials: "MD" },
  ],
  generalNotes: "Travaux en cours, avancement conforme a l'echeancier.",
  zones: [
    {
      zoneName: "Zone A - Test",
      items: [
        { number: "1.1", text: "Observation de test numero un.", actionBy: "Entrepreneur" },
        { number: "1.2", text: "Observation de test numero deux.", actionBy: "Architecte" },
      ],
    },
    {
      zoneName: "Zone B - Test",
      items: [{ number: "1.3", text: "Observation de test numero trois.", actionBy: "" }],
    },
  ],
  photoRows: [
    {
      photo1: { image: "x", caption: "Zone A (2025-01-29)", number: 1 },
      photo2: { image: "x", caption: "Zone A (2025-01-29)", number: 2 },
      photo3: { image: "x", caption: "Zone B (2025-01-29)", number: 3 },
    },
    {
      photo1: { image: "x", caption: "Zone B (2025-01-29)", number: 4 },
      // photo2/photo3 omitted on purpose to test the partial-row conditional
    },
  ],
  primaryDossierNumber: "4279",
  preparedByNameTitle: "Annie Test, Architecte",
};

doc
  .renderAsync(data)
  .then(() => {
    const buf = doc.getZip().generate({ type: "nodebuffer", compression: "DEFLATE" });
    fs.writeFileSync(outPath, buf);
    console.log("OK - wrote", outPath, buf.length, "bytes");
  })
  .catch((err) => {
    console.error("RENDER ERROR");
    if (err.properties && err.properties.errors) {
      err.properties.errors.forEach((e) => {
        console.error(JSON.stringify(e.properties, null, 2));
      });
    } else {
      console.error(err);
    }
    process.exit(1);
  });
