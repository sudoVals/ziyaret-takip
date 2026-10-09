// Excel dışa/içe aktarma ve birleştirme mantığı.
// ExcelJS kütüphanesi parametre olarak verilir (tarayıcıda global, testte npm).

export const SUTUNLAR = [
  { key: "no",         header: "No",                  width: 6 },
  { key: "tarih",      header: "Tarih",               width: 12, plan: "Planlanan Tarih" },
  { key: "saat",       header: "Saat",                width: 8 },
  { key: "firma",      header: "Firma",               width: 28 },
  { key: "sehir",      header: "Şehir",               width: 14 },
  { key: "adres",      header: "Adres",               width: 30 },
  { key: "kisiler",    header: "Görüşülen Kişiler",   width: 34, plan: "Görüşülecek Kişiler" },
  { key: "katilanlar", header: "Ziyarete Katılanlar", width: 24, plan: "Gidecekler" },
  { key: "guncelleyen",header: "Son Düzenleyen",      width: 20 },
  { key: "guncelleme", header: "Son Güncelleme",      width: 17 },
  { key: "notlar",     header: "Notlar / Konuşulanlar / Kararlar", width: 70, plan: "Plan Notları" },
  // Gizli sütunlar: dosya geri yüklenince kayıtları eşleştirmek için
  { key: "id",         header: "Kayıt ID",            width: 22, hidden: true },
  { key: "iso",        header: "Güncelleme ISO",      width: 24, hidden: true }
];

export function siralaZiyaretler(liste) {
  return [...liste].sort((a, b) =>
    (a.tarih ? 0 : 1) - (b.tarih ? 0 : 1) ||   // tarihsiz planlar en sona
    (a.tarih || "").localeCompare(b.tarih || "") ||
    (a.saat || "").localeCompare(b.saat || "") ||
    (a.olusturmaZamani || "").localeCompare(b.olusturmaZamani || "")
  );
}

export function kisilerMetni(kisiler) {
  return (kisiler || [])
    .filter(k => (k.ad || "").trim())
    .map(k => k.pozisyon && k.pozisyon.trim() ? `${k.ad.trim()} - ${k.pozisyon.trim()}` : k.ad.trim())
    .join("\n");
}

export function kisilerCoz(metin) {
  return String(metin || "")
    .split(/\r?\n/)
    .map(s => s.trim())
    .filter(Boolean)
    .map(satir => {
      const i = satir.indexOf(" - ");
      return i === -1 ? { ad: satir, pozisyon: "" } : { ad: satir.slice(0, i).trim(), pozisyon: satir.slice(i + 3).trim() };
    });
}

function isoTarihtenUTC(iso) {
  const [y, m, d] = (iso || "").split("-").map(Number);
  return y ? new Date(Date.UTC(y, m - 1, d)) : null;
}

export function zamanGoster(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d)) return "";
  const p = n => String(n).padStart(2, "0");
  return `${p(d.getDate())}.${p(d.getMonth() + 1)}.${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

export const SAYFA_ZIYARET = "Ziyaretler";
export const SAYFA_PLAN = "Planlanan Ziyaretler";

function sayfaEkle(wb, ad, liste, plan) {
  const ws = wb.addWorksheet(ad, { views: [{ state: "frozen", ySplit: 1 }] });
  ws.columns = SUTUNLAR.map(s => ({ header: (plan && s.plan) || s.header, key: s.key, width: s.width, hidden: !!s.hidden }));

  const baslik = ws.getRow(1);
  baslik.height = 24;
  baslik.eachCell(c => {
    c.font = { bold: true, color: { argb: plan ? "FFFBE6C8" : "FF000000" } };
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: plan ? "FF0B0B0B" : "FFE99A14" } };
    c.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
    c.border = { bottom: { style: "thin", color: { argb: "FF000000" } } };
  });

  siralaZiyaretler(liste).forEach((z, i) => {
    const row = ws.addRow({
      no: i + 1,
      tarih: isoTarihtenUTC(z.tarih),
      saat: z.saat || "",
      firma: z.firma || "",
      sehir: z.sehir || "",
      adres: z.adres || "",
      kisiler: kisilerMetni(z.kisiler),
      katilanlar: z.katilanlar || "",
      guncelleyen: z.guncelleyen || "",
      guncelleme: zamanGoster(z.guncellemeZamani),
      notlar: z.notlar || "",
      id: z.id || "",
      iso: z.guncellemeZamani || ""
    });
    row.getCell("tarih").numFmt = "dd.mm.yyyy";
    row.eachCell({ includeEmpty: true }, c => {
      c.alignment = { vertical: "top", wrapText: true };
      if (i % 2 === 1) c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFDF3E1" } };
    });
    row.getCell("no").alignment = { vertical: "top", horizontal: "center" };
  });
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: SUTUNLAR.filter(s => !s.hidden).length } };
}

// Tek dosya: 1. sayfa gerçekleşen ziyaretler, 2. sayfa planlanan ziyaretler
export async function excelOlustur(ExcelJS, ziyaretler) {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Hetronic Türkiye Ziyaret Takip";
  sayfaEkle(wb, SAYFA_ZIYARET, ziyaretler.filter(z => z.tur !== "plan"), false);
  sayfaEkle(wb, SAYFA_PLAN, ziyaretler.filter(z => z.tur === "plan"), true);
  return wb.xlsx.writeBuffer();
}

function hucreMetni(v) {
  if (v == null) return "";
  if (typeof v === "object") {
    if (v.richText) return v.richText.map(r => r.text).join("");
    if (v.text != null) return String(v.text);
    if (v.result != null) return String(v.result);
  }
  return String(v);
}

function tarihCoz(v) {
  const p = n => String(n).padStart(2, "0");
  if (v instanceof Date && !isNaN(v)) return `${v.getUTCFullYear()}-${p(v.getUTCMonth() + 1)}-${p(v.getUTCDate())}`;
  if (typeof v === "number") { // Excel seri tarihi
    const d = new Date(Math.round((v - 25569) * 86400000));
    return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}`;
  }
  const s = hucreMetni(v).trim();
  let m = s.match(/^(\d{1,2})[.\/-](\d{1,2})[.\/-](\d{4})/);
  if (m) return `${m[3]}-${p(m[2])}-${p(m[1])}`;
  m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  return "";
}

function saatCoz(v) {
  if (v instanceof Date && !isNaN(v)) return `${String(v.getUTCHours()).padStart(2, "0")}:${String(v.getUTCMinutes()).padStart(2, "0")}`;
  const m = hucreMetni(v).trim().match(/^(\d{1,2})[:.](\d{2})/);
  return m ? `${m[1].padStart(2, "0")}:${m[2]}` : "";
}

export async function excelOku(ExcelJS, arrayBuffer) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(arrayBuffer);
  if (!wb.worksheets.length) throw new Error("Dosyada sayfa bulunamadı.");
  const sonuc = [];
  let firmaliSayfa = 0;

  for (const ws of wb.worksheets) {
    const plan = /plan/i.test(ws.name);
    // Başlıklara göre sütun bul (sütun sırası değişmiş olsa da çalışsın)
    const kolon = {};
    ws.getRow(1).eachCell((c, i) => {
      const h = hucreMetni(c.value).trim().toLowerCase();
      const s = SUTUNLAR.find(s => s.header.toLowerCase() === h || (s.plan || "").toLowerCase() === h);
      if (s && !kolon[s.key]) kolon[s.key] = i;
    });
    if (!kolon.firma) continue;
    firmaliSayfa++;

    const al = (row, key) => (kolon[key] ? row.getCell(kolon[key]).value : null);
    ws.eachRow((row, n) => {
      if (n === 1) return;
      const firma = hucreMetni(al(row, "firma")).trim();
      if (!firma) return;
      sonuc.push({
        tur: plan ? "plan" : "ziyaret",
        id: hucreMetni(al(row, "id")).trim(),
        tarih: tarihCoz(al(row, "tarih")),
        saat: saatCoz(al(row, "saat")),
        firma,
        sehir: hucreMetni(al(row, "sehir")).trim(),
        adres: hucreMetni(al(row, "adres")).trim(),
        kisiler: kisilerCoz(hucreMetni(al(row, "kisiler"))),
        katilanlar: hucreMetni(al(row, "katilanlar")).trim(),
        notlar: hucreMetni(al(row, "notlar")).replace(/\r\n/g, "\n").trim(),
        guncellemeZamani: hucreMetni(al(row, "iso")).trim(),
        guncelleyen: hucreMetni(al(row, "guncelleyen")).trim()
      });
    });
  }
  if (!firmaliSayfa) throw new Error("Bu dosya ziyaret tablosuna benzemiyor (Firma sütunu yok).");
  return sonuc;
}

// İçerik karşılaştırması (meta alanlar hariç)
export function icerikAnahtari(z) {
  return JSON.stringify([
    z.tur === "plan" ? "plan" : "ziyaret", z.tarih || "", z.saat || "", (z.firma || "").trim(), (z.sehir || "").trim(), (z.adres || "").trim(), kisilerMetni(z.kisiler),
    (z.katilanlar || "").trim(), (z.notlar || "").replace(/\r\n/g, "\n").trim()
  ]);
}

// Yüklenen dosyayı mevcut kayıtlarla karşılaştırır, ne yapılacağını döndürür.
//  - eklenecek: yeni kayıtlar
//  - guncellenecek: dosyadaki hali daha yeni ya da dosya elle düzenlenmiş
//  - ayni: değişiklik yok
//  - cakisan: hem uygulamada hem dosyada farklı değişiklik var; uygulamadaki korunur
//  - silinmis: uygulamada silinenler kutusunda; tekrar eklenmez (gerekirse kutudan geri alınır)
export function birlestirmePlani(mevcut, gelen) {
  const idIle = new Map(mevcut.map(z => [z.id, z]));
  const anahtar = z => `${z.tur === "plan" ? "p" : "z"}|${(z.firma || "").trim().toLowerCase()}|${z.tarih}`;
  const firmaTarih = new Map(mevcut.filter(z => !z.silindi).map(z => [anahtar(z), z]));
  const plan = { eklenecek: [], guncellenecek: [], ayni: [], cakisan: [], silinmis: [] };
  const kullanilan = new Set();

  for (const g of gelen) {
    let m = g.id ? idIle.get(g.id) : null;
    if (!m) m = firmaTarih.get(anahtar(g));
    if (!m || kullanilan.has(m.id)) { plan.eklenecek.push(g); continue; }
    kullanilan.add(m.id);
    if (m.silindi) { plan.silinmis.push(m); continue; }

    if (icerikAnahtari(m) === icerikAnahtari(g)) { plan.ayni.push(m); continue; }
    const gZaman = g.guncellemeZamani || "";
    const mZaman = m.guncellemeZamani || "";
    if (gZaman > mZaman) plan.guncellenecek.push({ mevcut: m, yeni: g });          // dosya daha yeni
    else if (gZaman === mZaman || !gZaman) plan.guncellenecek.push({ mevcut: m, yeni: g, elle: true }); // Excel'de elle düzeltilmiş
    else plan.cakisan.push({ mevcut: m, yeni: g });                                 // uygulamadaki daha yeni
  }
  return plan;
}
