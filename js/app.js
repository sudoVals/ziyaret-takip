import { firebaseConfig, IZINLI_EPOSTALAR } from "./firebase-config.js";
import { DemoStore, FirebaseStore, CakismaHatasi, SilinmisHatasi } from "./store.js";
import { buyukHarf, kelimeBasi, cumleBasi } from "./metin.js";
import { excelOlustur, excelOku, birlestirmePlani, siralaZiyaretler, zamanGoster, icerikAnahtari } from "./excel.js";

const $ = s => document.querySelector(s);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const iki = n => String(n).padStart(2, "0");
const isoGun = d => `${d.getFullYear()}-${iki(d.getMonth() + 1)}-${iki(d.getDate())}`;
const bugun = () => isoGun(new Date());
const tarihGoster = iso => { const [y, m, d] = (iso || "").split("-"); return y ? `${d}.${m}.${y}` : ""; };
const norm = s => String(s || "").trim().replace(/\s+/g, " ").toLocaleLowerCase("tr");
const AYLAR = ["Oca", "Şub", "Mar", "Nis", "May", "Haz", "Tem", "Ağu", "Eyl", "Eki", "Kas", "Ara"];
const COP_GUN = 30;
const HATIRLATMA_GUN = 4;     // plan tarihine kaç gün kala hatırlatılsın

const demoMu = !firebaseConfig.apiKey || firebaseConfig.apiKey.startsWith("BURAYA");
let store;
let tumKayitlar = [];         // silinenler dahil her şey
let ziyaretler = [];          // aktif kayıtlar (ziyaret + plan), sıralı
let silinenler = [];
let firmalar = new Map();     // norm(firma) -> firma özeti
let acikKayit = null;         // pencerede açık kayıt { id, versiyon, icerik }
let dinlemeBitir = null;
let aktifSekme = "ziyaret";   // ziyaret | plan | firma | rapor
let formTur = "ziyaret";
let copTemizlendi = false;
const planMi = z => !!z && z.tur === "plan";

// ------------------------------------------------------------ Bildirim ve onay
let bildirimZaman;
function bildir(metin, sure = 2600) {
  const b = $("#bildirim");
  b.textContent = metin; b.classList.add("goster");
  clearTimeout(bildirimZaman); bildirimZaman = setTimeout(() => b.classList.remove("goster"), sure);
}

function sor(baslik, html, butonlar) {
  return new Promise(res => {
    const d = $("#onayPencere");
    $("#onayBaslik").textContent = baslik;
    $("#onayIcerik").innerHTML = html;
    const alt = $("#onayButonlar"); alt.innerHTML = "";
    butonlar.forEach(b => {
      const el = document.createElement("button");
      el.type = "button"; el.className = "btn " + (b.sinif || "btn-acik"); el.textContent = b.metin;
      el.onclick = () => { d.close(); res(b.deger); };
      alt.appendChild(el);
    });
    d.onclose = () => res(null);
    d.showModal();
  });
}

// ------------------------------------------------------------ Başlat
async function baslat() {
  if (demoMu) {
    store = new DemoStore();
    $("#demoUyari").hidden = false;
  } else {
    store = new FirebaseStore(firebaseConfig);
    try { await store.baslat(); }
    catch (e) {
      console.error(e);
      $("#girisEkrani").hidden = false;
      $("#girisMesaji").textContent = "Bağlantı kurulamadı. İnternetini kontrol edip sayfayı yenile.";
      $("#girisBtn").hidden = true;
      return;
    }
  }

  store.kullaniciDinle(kullanici => {
    if (dinlemeBitir) { dinlemeBitir(); dinlemeBitir = null; }
    if (!kullanici) { girisGoster(); return; }

    const eposta = (kullanici.email || "").toLowerCase();
    const listeAyarli = IZINLI_EPOSTALAR.some(e => !e.includes("adresin") && !e.includes("adresi@"));
    if (!store.demo && listeAyarli && !IZINLI_EPOSTALAR.map(e => e.toLowerCase()).includes(eposta)) {
      girisGoster(`${eposta} hesabının bu uygulamaya erişim izni yok. Başka bir hesapla giriş yap.`);
      store.cikisYap();
      return;
    }

    $("#girisEkrani").hidden = true;
    $("#anaEkran").hidden = false;
    $("#kullaniciAdi").textContent = kullanici.displayName || kullanici.email;
    $("#cikisBtn").hidden = store.demo;
    dinlemeBitir = store.ziyaretleriDinle(veriGeldi, hata => {
      console.error(hata);
      if (hata.code === "permission-denied") {
        girisGoster("Bu hesabın verilere erişim izni yok. Firestore kurallarındaki e-posta listesini kontrol et.");
        store.cikisYap();
      } else bildir("Veriler alınamadı: " + hata.message, 5000);
    });
  });
}

function girisGoster(mesaj) {
  $("#anaEkran").hidden = true;
  $("#girisEkrani").hidden = false;
  $("#girisMesaji").textContent = mesaj || "Devam etmek için Google hesabınla giriş yap.";
}

$("#girisBtn").onclick = async () => {
  try { await store.girisYap(); }
  catch (e) { console.error(e); bildir("Giriş yapılamadı: " + (e.code || e.message), 5000); }
};
$("#cikisBtn").onclick = () => store.cikisYap();

// ------------------------------------------------------------ Veri geldiğinde
function veriGeldi(liste, meta) {
  tumKayitlar = liste;
  ziyaretler = siralaZiyaretler(liste.filter(z => !z.silindi));
  silinenler = liste.filter(z => z.silindi).sort((a, b) => (b.silinmeZamani || "").localeCompare(a.silinmeZamani || ""));
  firmalar = firmalariHesapla();
  copBakimi();
  secenekleriDoldur();
  ekraniCiz();
  senkDurum(meta);
  if ($("#copPencere").open) copCiz();
  setTimeout(hatirlatmaKontrol, 400);

  // Açık pencerede gösterilen kayıt başkası tarafından değişti mi?
  if (acikKayit && acikKayit.id && $("#ziyaretPencere").open) {
    const guncel = ziyaretler.find(z => z.id === acikKayit.id);
    const u = $("#degistiUyari");
    if (!guncel) {
      u.hidden = false; u.textContent = "Bu kayıt başka bir cihazdan silindi.";
    } else if ((guncel.versiyon || 0) !== acikKayit.versiyon && guncel.guncelleyen !== (store.kullanici?.displayName)) {
      if (!formDegistiMi()) { formuDoldur(guncel); bildir(`${guncel.guncelleyen} bu kaydı güncelledi, ekran yenilendi.`); }
      else { u.hidden = false; u.textContent = `${guncel.guncelleyen || "Başka biri"} bu kaydı az önce değiştirdi. Kaydet'e bastığında hangisinin kalacağını seçebileceksin.`; }
    }
  }
}

// 30 günden eski silinenleri kalıcı sil (oturum başına bir kez)
function copBakimi() {
  if (copTemizlendi) return;
  copTemizlendi = true;
  const sinir = Date.now() - COP_GUN * 86400000;
  silinenler.filter(z => z.silinmeZamani && new Date(z.silinmeZamani).getTime() < sinir).forEach(z => store.kaliciSil(z.id));
}

function senkDurum(meta = {}) {
  const s = $("#senkDurum");
  s.className = "senk";
  if (store.demo) { s.title = "Demo modu"; return; }
  if (!navigator.onLine) { s.classList.add("cevrimdisi"); s.title = "Çevrimdışı: değişiklikler bağlantı gelince gönderilecek"; }
  else if (meta.yerelBekleyen) { s.classList.add("bekliyor"); s.title = "Gönderiliyor..."; }
  else { s.classList.add("tamam"); s.title = "Senkronize"; }
}
addEventListener("online", () => senkDurum());
addEventListener("offline", () => senkDurum());

// ------------------------------------------------------------ Firma ve kişi rehberi
function firmalariHesapla() {
  const m = new Map();
  for (const z of ziyaretler) {            // tarih sırasıyla: sonraki kayıtlar öncekini günceller
    const k = norm(z.firma);
    if (!k) continue;
    let f = m.get(k);
    if (!f) { f = { anahtar: k, ad: buyukHarf(z.firma), sehir: "", adres: "", kayitlar: [], ziyaretSay: 0, planSay: 0, ilk: "", son: "", kisiler: new Map() }; m.set(k, f); }
    f.ad = buyukHarf(z.firma);
    if (z.sehir) f.sehir = z.sehir;
    if (z.adres) f.adres = z.adres;
    f.kayitlar.push(z);
    if (planMi(z)) f.planSay++;
    else {
      f.ziyaretSay++;
      if (!f.ilk || z.tarih < f.ilk) f.ilk = z.tarih;
      if (!f.son || z.tarih > f.son) f.son = z.tarih;
    }
    for (const kisi of z.kisiler || []) {
      const kk = norm(kisi.ad);
      const onceki = f.kisiler.get(kk);
      f.kisiler.set(kk, {
        ad: kisi.ad,
        pozisyon: kisi.pozisyon || onceki?.pozisyon || "",
        son: planMi(z) ? (onceki?.son || "") : z.tarih,
        sayi: (onceki?.sayi || 0) + (planMi(z) ? 0 : 1)
      });
    }
  }
  return m;
}

function tumKisiler() {
  const m = new Map();
  for (const f of firmalar.values()) for (const [k, v] of f.kisiler) if (!m.has(k) || v.pozisyon) m.set(k, v);
  return m;
}

const katilanAyir = s => String(s || "").split(/[,;\n]| ve /).map(x => x.trim()).filter(Boolean);
const kayitSehri = z => z.sehir || firmalar.get(norm(z.firma))?.sehir || "";
const haritaAdresi = (firma, adres, sehir) =>
  "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent([firma, adres, sehir].filter(Boolean).join(", "));

// ------------------------------------------------------------ Filtre
function donemAraligi() {
  const d = $("#fDonem").value, n = new Date(), y = n.getFullYear(), a = n.getMonth();
  const ay = (yy, mm) => isoGun(new Date(yy, mm, 1));
  const aySonu = (yy, mm) => isoGun(new Date(yy, mm + 1, 0));
  switch (d) {
    case "buay": return [ay(y, a), aySonu(y, a)];
    case "gecenay": return [ay(y, a - 1), aySonu(y, a - 1)];
    case "son3": return [ay(y, a - 2), aySonu(y, a)];
    case "buyil": return [`${y}-01-01`, `${y}-12-31`];
    case "gecenyil": return [`${y - 1}-01-01`, `${y - 1}-12-31`];
    case "ozel": return [$("#fBas").value || "0000-01-01", $("#fBit").value || "9999-12-31"];
    default: return null;
  }
}

function filtreAktifMi() { return $("#fDonem").value !== "tumu" || $("#fSehir").value || $("#fKatilan").value; }

function filtreUygula(liste) {
  const ar = donemAraligi(), sehir = $("#fSehir").value, katilan = $("#fKatilan").value;
  return liste.filter(z =>
    (!ar || (z.tarih >= ar[0] && z.tarih <= ar[1])) &&
    (!sehir || norm(kayitSehri(z)) === sehir) &&
    (!katilan || katilanAyir(z.katilanlar).some(k => norm(k) === katilan)));
}

function secenekDoldur(select, degerler, ilkMetin) {
  const secili = select.value;
  select.innerHTML = `<option value="">${ilkMetin}</option>` +
    degerler.map(([v, t]) => `<option value="${esc(v)}">${esc(t)}</option>`).join("");
  if (degerler.some(([v]) => v === secili)) select.value = secili;
}

function secenekleriDoldur() {
  const sehirler = new Map(), katilanlar = new Map();
  for (const z of ziyaretler) {
    const s = kayitSehri(z); if (s) sehirler.set(norm(s), s);
    for (const k of katilanAyir(z.katilanlar)) katilanlar.set(norm(k), k);
  }
  const sirala = m => [...m.entries()].sort((a, b) => a[1].localeCompare(b[1], "tr"));
  secenekDoldur($("#fSehir"), sirala(sehirler), "Tüm şehirler");
  secenekDoldur($("#fKatilan"), sirala(katilanlar), "Herkes");
  $("#sehirListesi").innerHTML = sirala(sehirler).map(([, t]) => `<option value="${esc(t)}">`).join("");
  $("#firmaListesi").innerHTML = [...firmalar.values()].map(f => f.ad).sort((a, b) => a.localeCompare(b, "tr"))
    .map(f => `<option value="${esc(f)}">`).join("");
}

$("#fDonem").onchange = () => {
  const ozel = $("#fDonem").value === "ozel";
  $("#fOzelBas").hidden = $("#fOzelBit").hidden = !ozel;
  ekraniCiz();
};
["#fBas", "#fBit", "#fSehir", "#fKatilan"].forEach(s => $(s).onchange = ekraniCiz);
$("#filtreTemizle").onclick = () => {
  $("#fDonem").value = "tumu"; $("#fSehir").value = ""; $("#fKatilan").value = "";
  $("#fOzelBas").hidden = $("#fOzelBit").hidden = true;
  ekraniCiz();
};

// ------------------------------------------------------------ Ekran
function ekraniCiz() {
  const gercek = ziyaretler.filter(z => !planMi(z));
  const planlar = ziyaretler.filter(planMi);
  $("#sayToplam").textContent = gercek.length;
  $("#sayPlanli").textContent = planlar.length;
  $("#sayFirma").textContent = firmalar.size;
  $("#sekmeSayZ").textContent = `(${gercek.length})`;
  $("#sekmeSayP").textContent = `(${planlar.length})`;
  $("#sekmeSayF").textContent = `(${firmalar.size})`;
  $("#copSay").textContent = silinenler.length ? `(${silinenler.length})` : "";

  const filtreli = aktifSekme === "ziyaret" || aktifSekme === "rapor";
  $("#filtreBar").hidden = !filtreli;
  $("#aracBar").hidden = aktifSekme === "rapor";
  $("#liste").hidden = aktifSekme === "rapor";
  $("#rapor").hidden = aktifSekme !== "rapor";
  $("#ekleBtn").hidden = aktifSekme === "rapor";
  $("#arama").placeholder = aktifSekme === "firma" ? "Firma, şehir veya kişi ara" : "Firma, kişi veya notlarda ara";

  if (filtreli && filtreAktifMi()) {
    const n = filtreUygula(gercek).length;
    $("#filtreOzet").hidden = false;
    $("#filtreOzetMetin").textContent = `${gercek.length} ziyaretten ${n} tanesi seçili`;
  } else $("#filtreOzet").hidden = true;

  if (aktifSekme === "rapor") { $("#bosListe").hidden = true; raporCiz(); return; }
  if (aktifSekme === "firma") { firmaListesiCiz(); return; }
  listeCiz(aktifSekme === "plan" ? planlar : gercek);
}

function gunFarki(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  const t = new Date(y, m - 1, d), n = new Date(); n.setHours(0, 0, 0, 0);
  return Math.round((t - n) / 86400000);
}

function planEtiketi(z) {
  if (!z.tarih) return `<span class="etiket belirsiz">Tarih belirsiz</span>`;
  const f = gunFarki(z.tarih);
  if (f < 0) return `<span class="etiket gecti">Tarihi geçti</span>`;
  if (f === 0) return `<span class="etiket bugun">Bugün</span>`;
  if (f === 1) return `<span class="etiket">Yarın</span>`;
  return `<span class="etiket">${f} gün sonra</span>`;
}

const aramaMetni = z => [z.firma, z.sehir, z.adres, z.katilanlar, z.notlar, ...(z.kisiler || []).flatMap(k => [k.ad, k.pozisyon])].join(" ").toLocaleLowerCase("tr");

function listeCiz(tamListe) {
  const q = $("#arama").value.trim().toLocaleLowerCase("tr");
  const plan = aktifSekme === "plan";
  let gosterilen = plan ? tamListe : filtreUygula(tamListe);
  if (q) gosterilen = gosterilen.filter(z => aramaMetni(z).includes(q));
  const sira = new Map(tamListe.map((z, i) => [z.id, i + 1]));   // numara her zaman tam listedeki sıra

  const ol = $("#liste");
  ol.className = "liste" + (plan ? " plan-modu" : "");
  ol.innerHTML = "";
  for (const z of gosterilen) {
    const kisiSayisi = (z.kisiler || []).length;
    let alt = kisiSayisi ? (z.kisiler.map(k => k.ad).slice(0, 3).join(", ") + (kisiSayisi > 3 ? ` +${kisiSayisi - 3}` : "")) : "";
    if (plan) alt = (z.notlar || "").split("\n")[0] || alt || "Not girilmedi";
    else alt = alt || "Kişi girilmedi";
    const sehir = kayitSehri(z);
    const li = document.createElement("li");
    li.className = "oge"; li.tabIndex = 0;
    li.innerHTML = `
      <div class="no">${sira.get(z.id)}</div>
      <div class="oge-orta">
        <div class="oge-firma">${esc(buyukHarf(z.firma))}</div>
        <div class="oge-alt">${sehir ? `<span class="sehir">${esc(sehir)}</span> · ` : ""}${esc(alt)}</div>
      </div>
      <div class="oge-tarih">${tarihGoster(z.tarih)}${z.saat ? `<small>${esc(z.saat)}</small>` : ""}${plan ? planEtiketi(z) : ""}</div>`;
    li.onclick = () => pencereAc(z);
    li.onkeydown = e => { if (e.key === "Enter") pencereAc(z); };
    ol.appendChild(li);
  }
  $("#bosListe").hidden = gosterilen.length > 0;
  $("#bosMetin").textContent = tamListe.length
    ? "Bu arama veya filtreyle eşleşen kayıt yok."
    : plan ? "Planlanmış ziyaret yok." : "Henüz ziyaret yok.";
  $("#bosIpucu").hidden = tamListe.length > 0;
}

function firmaListesiCiz() {
  const q = $("#arama").value.trim().toLocaleLowerCase("tr");
  let liste = [...firmalar.values()].sort((a, b) => a.ad.localeCompare(b.ad, "tr"));
  if (q) liste = liste.filter(f => [f.ad, f.sehir, f.adres, ...[...f.kisiler.values()].flatMap(k => [k.ad, k.pozisyon])].join(" ").toLocaleLowerCase("tr").includes(q));

  const ol = $("#liste");
  ol.className = "liste firma-modu";
  ol.innerHTML = "";
  for (const f of liste) {
    const kisiSay = f.kisiler.size;
    const li = document.createElement("li");
    li.className = "oge"; li.tabIndex = 0;
    li.innerHTML = `
      <div class="no harf">${esc(f.ad.charAt(0).toLocaleUpperCase("tr"))}</div>
      <div class="oge-orta">
        <div class="oge-firma">${esc(f.ad)}</div>
        <div class="oge-alt">${f.sehir ? `<span class="sehir">${esc(f.sehir)}</span> · ` : ""}${kisiSay ? `${kisiSay} kişi` : "Kişi girilmedi"}${f.planSay ? ` · ${f.planSay} plan` : ""}</div>
      </div>
      <div class="oge-tarih">${f.ziyaretSay} ziyaret${f.son ? `<small>son: ${tarihGoster(f.son)}</small>` : `<small>henüz gidilmedi</small>`}</div>`;
    li.onclick = () => firmaPaneliAc(f.anahtar);
    li.onkeydown = e => { if (e.key === "Enter") firmaPaneliAc(f.anahtar); };
    ol.appendChild(li);
  }
  $("#bosListe").hidden = liste.length > 0;
  $("#bosMetin").textContent = firmalar.size ? "Aramayla eşleşen firma yok." : "Henüz firma yok. Ziyaret ya da plan ekledikçe firmalar burada listelenir.";
  $("#bosIpucu").hidden = firmalar.size > 0;
}

$("#arama").oninput = ekraniCiz;

function sekmeSec(sekme) {
  aktifSekme = sekme;
  document.querySelectorAll(".sekme").forEach(x => x.classList.toggle("aktif", x.dataset.sekme === sekme));
  ekraniCiz();
}
document.querySelectorAll(".sekme").forEach(btn => btn.onclick = () => sekmeSec(btn.dataset.sekme));

// ------------------------------------------------------------ Rapor
function sirali(m, n = 8) { return [...m.entries()].sort((a, b) => b[1].sayi - a[1].sayi || a[1].ad.localeCompare(b[1].ad, "tr")).slice(0, n); }

function cubukListesi(baslik, girdiler, tiklanabilir) {
  if (!girdiler.length) return `<div class="rapor-kart"><h3>${baslik}</h3><p class="kayit-bilgi">Bu dönemde veri yok.</p></div>`;
  const enCok = girdiler[0][1].sayi;
  return `<div class="rapor-kart"><h3>${baslik}</h3><ul class="cubuklar">${girdiler.map(([k, v]) => `
    <li${tiklanabilir ? ` class="tiklanir" data-firma="${esc(k)}" tabindex="0"` : ""}>
      <span class="cubuk-ad">${esc(v.ad)}</span>
      <span class="cubuk-iz"><span class="cubuk" style="width:${Math.max(4, (v.sayi / enCok) * 100)}%"></span></span>
      <span class="cubuk-sayi">${v.sayi}</span>
    </li>`).join("")}</ul></div>`;
}

function aylikGrafik(liste) {
  const ar = donemAraligi();
  // Gösterilecek aylar: seçili dönem (en fazla 24 ay), yoksa son 12 ay
  let bas, bit;
  const n = new Date();
  if (ar && ar[0] > "0001" && ar[1] < "9999") {
    bas = new Date(+ar[0].slice(0, 4), +ar[0].slice(5, 7) - 1, 1);
    bit = new Date(+ar[1].slice(0, 4), +ar[1].slice(5, 7) - 1, 1);
  } else { bit = new Date(n.getFullYear(), n.getMonth(), 1); bas = new Date(bit.getFullYear(), bit.getMonth() - 11, 1); }
  const aylar = [];
  for (let d = new Date(bas); d <= bit && aylar.length < 24; d.setMonth(d.getMonth() + 1))
    aylar.push({ k: `${d.getFullYear()}-${iki(d.getMonth() + 1)}`, ad: AYLAR[d.getMonth()], yil: d.getFullYear(), sayi: 0 });
  if (aylar.length > 24 || !aylar.length) return "";
  const idx = new Map(aylar.map((a, i) => [a.k, i]));
  for (const z of liste) { const i = idx.get((z.tarih || "").slice(0, 7)); if (i != null) aylar[i].sayi++; }
  const enCok = Math.max(1, ...aylar.map(a => a.sayi));
  const enCokIdx = aylar.findIndex(a => a.sayi === enCok);
  const ustSinir = Math.max(2, Math.ceil(enCok / 2) * 2);  // çift sayıya yuvarla, orta çizgi tam sayı olsun
  const yilDegisir = aylar[0].yil !== aylar[aylar.length - 1].yil;
  return `<div class="rapor-kart genis"><h3>Aylara göre ziyaret sayısı</h3>
    <div class="ay-grafik" style="--sutun:${aylar.length}">
      <div class="ay-eksen"><span>${ustSinir}</span><span>${ustSinir / 2}</span><span>0</span></div>
      <div class="ay-alan">
        <div class="ay-cizgi" style="bottom:100%"></div><div class="ay-cizgi" style="bottom:50%"></div>
        ${aylar.map((a, i) => `
          <div class="ay" tabindex="0" aria-label="${a.ad} ${a.yil}: ${a.sayi} ziyaret">
            <div class="ay-cubuk${a.sayi ? "" : " sifir"}" style="height:${(a.sayi / ustSinir) * 100}%">
              ${(i === enCokIdx && a.sayi) || (i === aylar.length - 1 && a.sayi) ? `<span class="ay-deger">${a.sayi}</span>` : ""}
            </div>
            <div class="ay-ipucu">${a.ad} ${a.yil}<b>${a.sayi} ziyaret</b></div>
          </div>`).join("")}
      </div>
    </div>
    <div class="ay-etiketler" style="--sutun:${aylar.length}">${aylar.map((a, i) =>
      `<span>${a.ad}${yilDegisir && (i === 0 || a.ad === "Oca") ? `<br><small>${a.yil}</small>` : ""}</span>`).join("")}</div>
  </div>`;
}

function raporCiz() {
  const gercek = ziyaretler.filter(z => !planMi(z));
  const liste = filtreUygula(gercek);
  const firmaSay = new Map(), sehirSay = new Map(), kisiSet = new Set(), edenSay = new Map();
  for (const z of liste) {
    const fk = norm(z.firma);
    firmaSay.set(fk, { ad: firmalar.get(fk)?.ad || buyukHarf(z.firma), sayi: (firmaSay.get(fk)?.sayi || 0) + 1 });
    const s = kayitSehri(z);
    if (s) sehirSay.set(norm(s), { ad: s, sayi: (sehirSay.get(norm(s))?.sayi || 0) + 1 });
    for (const k of z.kisiler || []) kisiSet.add(fk + "|" + norm(k.ad));
    for (const k of katilanAyir(z.katilanlar)) edenSay.set(norm(k), { ad: k, sayi: (edenSay.get(norm(k))?.sayi || 0) + 1 });
  }
  // Bu dönemde ilk kez ziyaret edilen firmalar
  const ar = donemAraligi();
  const yeniFirma = [...firmaSay.keys()].filter(k => { const f = firmalar.get(k); return f && f.ilk && (!ar || f.ilk >= ar[0]); }).length;

  $("#rapor").innerHTML = `
    <div class="rapor-ozet">
      <div><b>${liste.length}</b><span>Ziyaret</span></div>
      <div><b>${firmaSay.size}</b><span>Farklı firma</span></div>
      <div><b>${kisiSet.size}</b><span>Görüşülen kişi</span></div>
      <div><b>${yeniFirma}</b><span>İlk kez gidilen firma</span></div>
    </div>
    ${aylikGrafik(liste)}
    <div class="rapor-izgara">
      ${cubukListesi("En çok ziyaret edilen firmalar", sirali(firmaSay), true)}
      ${cubukListesi("Şehirlere göre", sirali(sehirSay))}
      ${cubukListesi("Ziyaret edenlere göre", sirali(edenSay))}
    </div>`;
  $("#rapor").querySelectorAll("[data-firma]").forEach(li => {
    li.onclick = () => firmaPaneliAc(li.dataset.firma);
    li.onkeydown = e => { if (e.key === "Enter") firmaPaneliAc(li.dataset.firma); };
  });
}

// ------------------------------------------------------------ Firma paneli
let paneldekiFirma = null;
let panelFormdan = false;

function firmaPaneliAc(anahtar, formdan = false) {
  const f = firmalar.get(anahtar);
  if (!f) return;
  paneldekiFirma = f; panelFormdan = formdan;
  $("#firmaBaslik").textContent = f.ad;
  $("#firmaAlt").hidden = formdan;

  const kisiler = [...f.kisiler.values()].sort((a, b) => (b.son || "").localeCompare(a.son || "") || a.ad.localeCompare(b.ad, "tr"));
  const kayitlar = [...f.kayitlar].sort((a, b) => (b.tarih || "9999").localeCompare(a.tarih || "9999"));
  const konumVar = f.sehir || f.adres;

  $("#firmaIcerik").innerHTML = `
    <div class="firma-konum">
      <div>${konumVar ? `<b>${esc(f.sehir)}</b>${f.adres ? (f.sehir ? " · " : "") + esc(f.adres) : ""}` : `<span class="kayit-bilgi">Konum girilmemiş</span>`}</div>
      <a class="harita-link" target="_blank" rel="noopener" href="${haritaAdresi(f.ad, f.adres, f.sehir)}">Haritada aç</a>
    </div>
    <p class="firma-ozet">${f.ziyaretSay} ziyaret${f.planSay ? ` · ${f.planSay} plan` : ""}${f.ilk ? ` · ilk ziyaret ${tarihGoster(f.ilk)}` : ""}${f.son && f.son !== f.ilk ? ` · son ziyaret ${tarihGoster(f.son)}` : ""}</p>

    <h3 class="bolum">Kişiler</h3>
    ${kisiler.length ? `<ul class="kisi-rehber">${kisiler.map(k => `
      <li><span><b>${esc(k.ad)}</b>${k.pozisyon ? `<small>${esc(k.pozisyon)}</small>` : ""}</span>
          <span class="kayit-bilgi">${k.son ? `son görüşme ${tarihGoster(k.son)}` : "henüz görüşülmedi"}</span></li>`).join("")}</ul>`
      : `<p class="kayit-bilgi">Kişi girilmemiş.</p>`}

    <h3 class="bolum">Geçmiş</h3>
    <div class="gecmis">${kayitlar.map(z => `
      <details>
        <summary>
          <span class="gecmis-tarih">${z.tarih ? tarihGoster(z.tarih) : "Tarih yok"}</span>
          ${planMi(z) ? planEtiketi(z) : `<span class="etiket koyu">Ziyaret</span>`}
          <span class="gecmis-kisa">${esc((z.notlar || "").split("\n")[0] || (z.kisiler || []).map(k => k.ad).join(", "))}</span>
        </summary>
        <div class="gecmis-detay">
          ${(z.kisiler || []).length ? `<p><b>${planMi(z) ? "Görüşülecek" : "Görüşülen"}:</b> ${z.kisiler.map(k => esc(k.ad) + (k.pozisyon ? ` (${esc(k.pozisyon)})` : "")).join(", ")}</p>` : ""}
          ${z.katilanlar ? `<p><b>${planMi(z) ? "Gidecekler" : "Katılanlar"}:</b> ${esc(z.katilanlar)}</p>` : ""}
          ${z.notlar ? `<p class="gecmis-not">${esc(z.notlar)}</p>` : `<p class="kayit-bilgi">Not yok.</p>`}
          ${formdan ? "" : `<button type="button" class="btn btn-acik kucuk" data-ac="${esc(z.id)}">Kaydı aç</button>`}
        </div>
      </details>`).join("")}</div>`;

  $("#firmaIcerik").querySelectorAll("[data-ac]").forEach(b => b.onclick = () => {
    const z = ziyaretler.find(x => x.id === b.dataset.ac);
    $("#firmaPencere").close();
    if (z) pencereAc(z);
  });
  $("#firmaPencere").showModal();
}
$("#firmaKapat").onclick = () => $("#firmaPencere").close();
const firmadanYeni = tur => {
  const f = paneldekiFirma;
  $("#firmaPencere").close();
  pencereAc(null, { tur, firma: f.ad, sehir: f.sehir, adres: f.adres });
};
$("#firmaZiyaretBtn").onclick = () => firmadanYeni("ziyaret");
$("#firmaPlanBtn").onclick = () => firmadanYeni("plan");

// ------------------------------------------------------------ Ziyaret penceresi
const form = $("#ziyaretForm");

function kisiSatiri(k = { ad: "", pozisyon: "" }) {
  const d = document.createElement("div");
  d.className = "kisi";
  d.innerHTML = `<input placeholder="Ad Soyad" class="k-ad" list="kisiOnerileri" autocomplete="off" value="${esc(k.ad)}">
                 <input placeholder="Pozisyon" class="k-poz" value="${esc(k.pozisyon)}">
                 <button type="button" class="kisi-sil" aria-label="Kişiyi kaldır">×</button>`;
  d.querySelector(".kisi-sil").onclick = () => d.remove();
  d.querySelector(".k-poz").addEventListener("change", e => { e.target.value = cumleBasi(e.target.value); });
  // Rehberden seçilen kişinin pozisyonunu otomatik doldur
  d.querySelector(".k-ad").addEventListener("change", e => {
    e.target.value = kelimeBasi(e.target.value);
    const poz = d.querySelector(".k-poz");
    if (poz.value.trim()) return;
    const kk = norm(e.target.value);
    const kaynak = firmalar.get(norm(form.firma.value))?.kisiler.get(kk) || tumKisiler().get(kk);
    if (kaynak?.pozisyon) poz.value = kaynak.pozisyon;
  });
  $("#kisiler").appendChild(d);
  return d;
}
$("#kisiEkleBtn").onclick = () => kisiSatiri().querySelector(".k-ad").focus();

function formModu(tur) {
  formTur = tur;
  const plan = tur === "plan";
  $("#lblTarih").textContent = plan ? "Planlanan tarih (boş kalabilir)" : "Ziyaret tarihi";
  $("#lblKisiler").textContent = plan ? "Görüşülecek kişiler" : "Görüşülen kişiler";
  $("#lblKatilan").textContent = plan ? "Kimlerle gidilecek" : "Ziyarete katılanlar";
  $("#lblNotlar").textContent = plan ? "Plan notları (amaç, hazırlık, ne konuşulacak)" : "Notlar / konuşulanlar / alınan kararlar";
}

function formOku() {
  return {
    tur: formTur,
    firma: form.firma.value, sehir: form.sehir.value, adres: form.adres.value,
    tarih: form.tarih.value, saat: form.saat.value,
    katilanlar: form.katilanlar.value, notlar: form.notlar.value,
    kisiler: [...document.querySelectorAll("#kisiler .kisi")].map(d => ({ ad: d.querySelector(".k-ad").value, pozisyon: d.querySelector(".k-poz").value }))
  };
}

// Firma adı yazıldıkça: geçmiş bilgisi, kişi önerileri, harita bağlantısı
function firmaBilgisiGuncelle() {
  const f = firmalar.get(norm(form.firma.value));
  const digerleri = f ? f.kayitlar.filter(z => z.id !== acikKayit?.id) : [];
  const ziyaretSay = digerleri.filter(z => !planMi(z)).length;
  const son = digerleri.filter(z => !planMi(z)).map(z => z.tarih).sort().pop();
  if (f && digerleri.length) {
    $("#firmaBilgi").hidden = false;
    $("#firmaBilgiMetin").textContent = ziyaretSay
      ? `Bu firmaya daha önce ${ziyaretSay} kez gidildi · son ziyaret ${tarihGoster(son)}`
      : `Bu firma için ${digerleri.length} plan kayıtlı, henüz ziyaret yok`;
  } else $("#firmaBilgi").hidden = true;

  const kisiler = f ? [...f.kisiler.values()] : [...tumKisiler().values()];
  $("#kisiOnerileri").innerHTML = kisiler.sort((a, b) => a.ad.localeCompare(b.ad, "tr"))
    .map(k => `<option value="${esc(k.ad)}">${esc(k.pozisyon)}</option>`).join("");
  haritaGuncelle();
}

function haritaGuncelle() {
  const l = $("#haritaLink");
  const sehir = form.sehir.value.trim(), adres = form.adres.value.trim();
  l.hidden = !(sehir || adres);
  l.href = haritaAdresi(form.firma.value.trim(), adres, sehir);
}

form.firma.addEventListener("input", firmaBilgisiGuncelle);
// Alandan çıkınca yazımı düzelt: firma tamamı büyük, isim/şehir kelime başları, diğerleri cümle başları
form.firma.addEventListener("change", () => { form.firma.value = buyukHarf(form.firma.value); });
form.sehir.addEventListener("change", () => { form.sehir.value = kelimeBasi(form.sehir.value); haritaGuncelle(); });
form.adres.addEventListener("change", () => { form.adres.value = cumleBasi(form.adres.value); haritaGuncelle(); });
form.katilanlar.addEventListener("change", () => { form.katilanlar.value = kelimeBasi(form.katilanlar.value); });
form.notlar.addEventListener("change", () => { form.notlar.value = cumleBasi(form.notlar.value); });
form.firma.addEventListener("change", () => {
  // Bilinen firma seçildiyse ve konum boşsa konumu doldur
  const f = firmalar.get(norm(form.firma.value));
  if (f && !form.sehir.value.trim() && !form.adres.value.trim()) {
    form.sehir.value = f.sehir; form.adres.value = f.adres; haritaGuncelle();
  }
});
form.sehir.addEventListener("input", haritaGuncelle);
form.adres.addEventListener("input", haritaGuncelle);
$("#firmaGecmisBtn").onclick = () => firmaPaneliAc(norm(form.firma.value), true);

function formuDoldur(z) {
  formModu(planMi(z) ? "plan" : "ziyaret");
  form.firma.value = buyukHarf(z.firma);
  form.sehir.value = z.sehir || "";
  form.adres.value = z.adres || "";
  form.tarih.value = z.tarih || (planMi(z) ? "" : bugun());
  form.saat.value = z.saat || "";
  form.katilanlar.value = z.katilanlar || ""; form.notlar.value = z.notlar || "";
  $("#kisiler").innerHTML = "";
  (z.kisiler && z.kisiler.length ? z.kisiler : [{ ad: "", pozisyon: "" }]).forEach(kisiSatiri);
  if (z.id) {
    acikKayit = { id: z.id, versiyon: z.versiyon || 0, icerik: icerikAnahtari(formOku()) };
    const ayniTur = ziyaretler.filter(x => planMi(x) === planMi(z));
    const sira = ayniTur.findIndex(x => x.id === z.id) + 1;
    $("#pencereBaslik").textContent = planMi(z) ? `Planlanan ziyaret #${sira}` : `Ziyaret #${sira}`;
    $("#kayitBilgi").textContent = `Oluşturan: ${z.olusturan || "-"} (${zamanGoster(z.olusturmaZamani)})  ·  Son düzenleyen: ${z.guncelleyen || "-"} (${zamanGoster(z.guncellemeZamani)})`;
  } else {
    acikKayit = { id: null, versiyon: 0, icerik: icerikAnahtari(formOku()) };
    $("#pencereBaslik").textContent = planMi(z) ? "Yeni planlanan ziyaret" : "Yeni ziyaret";
    $("#kayitBilgi").textContent = "";
  }
  $("#silBtn").hidden = !z.id;
  $("#planBant").hidden = !(z.id && planMi(z));
  $("#degistiUyari").hidden = true;
  firmaBilgisiGuncelle();
}

const formDegistiMi = () => acikKayit && icerikAnahtari(formOku()) !== acikKayit.icerik;

function pencereAc(z, onDolu) {
  const varsayilanTur = aktifSekme === "plan" ? "plan" : "ziyaret";
  formuDoldur(z || onDolu || { tur: varsayilanTur });
  $("#ziyaretPencere").showModal();
  if (!z) (onDolu ? form.tarih : form.firma).focus();
}
$("#ekleBtn").onclick = () => pencereAc(null);

// Planlanan ziyaret gerçekleşince: aynı kaydı "ziyaretler"e çevir, notları doldurtsun
$("#gerceklestiBtn").onclick = () => {
  const planNotu = form.notlar.value.trim();
  formModu("ziyaret");
  form.tarih.value = bugun();
  form.notlar.value = planNotu ? `Plan notu: ${planNotu}\n\n` : "";
  $("#planBant").hidden = true;
  $("#pencereBaslik").textContent = "Ziyareti tamamla";
  bildir("Tarihi ve notları kontrol edip Kaydet'e bas");
  form.notlar.focus();
  form.notlar.setSelectionRange(form.notlar.value.length, form.notlar.value.length);
};

async function pencereKapat() {
  if (formDegistiMi()) {
    const c = await sor("Kaydedilmemiş değişiklik", "<p>Bu kayıtta kaydetmediğin değişiklikler var. Çıkmak istiyor musun?</p>",
      [{ metin: "Geri dön", deger: false }, { metin: "Kaydetmeden çık", sinif: "btn-tehlike", deger: true }]);
    if (!c) return;
  }
  acikKayit = null;
  $("#ziyaretPencere").close();
}
document.querySelectorAll("[data-kapat]").forEach(b => b.onclick = pencereKapat);
$("#ziyaretPencere").addEventListener("cancel", e => { e.preventDefault(); pencereKapat(); });

form.onsubmit = async e => {
  e.preventDefault();
  const veri = formOku();
  if (!veri.firma.trim()) { form.firma.focus(); return; }
  if (veri.tur === "ziyaret" && !veri.tarih) { form.tarih.focus(); bildir("Ziyaret tarihini gir"); return; }
  // Bilinen firmanın yazımını birleştir (büyük/küçük harf farkı ayrı firma gibi görünmesin)
  const bilinen = firmalar.get(norm(veri.firma));
  if (bilinen) veri.firma = bilinen.ad;
  const oncekiHal = acikKayit.id ? ziyaretler.find(z => z.id === acikKayit.id) : null;
  const tamamlandi = planMi(oncekiHal) && veri.tur === "ziyaret";
  try {
    if (!acikKayit.id) {
      await store.ekle(veri);
      bildir(veri.tur === "plan" ? "Plan kaydedildi" : "Ziyaret kaydedildi");
    } else {
      await kaydetCakismaKontrollu(veri);
    }
    acikKayit = null;
    $("#ziyaretPencere").close();
    if (tamamlandi) { sekmeSec("ziyaret"); bildir("Ziyaretlere taşındı"); }
  } catch (err) {
    if (err === "iptal") return;
    console.error(err);
    bildir("Kaydedilemedi: " + (err.code || err.message), 5000);
  }
};

async function kaydetCakismaKontrollu(veri, zorla = false) {
  try {
    await store.guncelle(acikKayit.id, veri, acikKayit.versiyon, zorla);
    bildir("Değişiklikler kaydedildi");
  } catch (err) {
    if (err instanceof SilinmisHatasi) {
      const c = await sor("Kayıt silinmiş", "<p>Bu kayıt sen düzenlerken başka bir cihazdan silinmiş. Senin hâlini yeni kayıt olarak kaydedeyim mi?</p>",
        [{ metin: "Vazgeç", deger: false }, { metin: "Yeni olarak kaydet", sinif: "btn-birincil", deger: true }]);
      if (!c) throw "iptal";
      await store.ekle(veri); bildir("Yeni kayıt olarak kaydedildi"); return;
    }
    if (err instanceof CakismaHatasi) {
      const s = err.sunucudaki;
      const secim = await sor("Bu kayıt değiştirilmiş",
        `<p><b>${esc(s.guncelleyen || "Başka biri")}</b>, sen bu kaydı açtıktan sonra değiştirmiş (${esc(zamanGoster(s.guncellemeZamani))}).</p>
         <p>Onun kaydettiği notlar:</p><div class="karsilastir">${esc(s.notlar || "(boş)")}</div>
         <p>Ne yapmak istersin?</p>`,
        [{ metin: "Onunkini göster", deger: "onun" }, { metin: "Benimkini kaydet", sinif: "btn-birincil", deger: "benim" }]);
      if (secim === "benim") { await kaydetCakismaKontrollu(veri, true); return; }
      if (secim === "onun") { formuDoldur(s); bildir("Güncel hâli yüklendi, istersen düzenleyip tekrar kaydet."); }
      throw "iptal";
    }
    throw err;
  }
}

$("#silBtn").onclick = async () => {
  const firma = form.firma.value || "bu kayıt";
  const ne = formTur === "plan" ? "planını" : "ziyaretini";
  const c = await sor("Sil", `<p><b>${esc(firma)}</b>${form.tarih.value ? ` (${tarihGoster(form.tarih.value)})` : ""} ${ne} silmek istiyor musun?</p>
    <p class="kayit-bilgi">Kayıt silinenler kutusuna taşınır. ${COP_GUN} gün içinde geri alınabilir.</p>`,
    [{ metin: "Vazgeç", deger: false }, { metin: "Sil", sinif: "btn-tehlike", deger: true }]);
  if (!c) return;
  await store.sil(acikKayit.id);
  acikKayit = null;
  $("#ziyaretPencere").close();
  bildir("Silinenler kutusuna taşındı");
};

// ------------------------------------------------------------ Silinenler kutusu
function copCiz() {
  const ul = $("#copListe");
  if (!silinenler.length) { ul.innerHTML = `<li class="kayit-bilgi">Silinenler kutusu boş.</li>`; return; }
  ul.innerHTML = silinenler.map(z => {
    const gecen = z.silinmeZamani ? Math.floor((Date.now() - new Date(z.silinmeZamani)) / 86400000) : 0;
    const kalan = Math.max(0, COP_GUN - gecen);
    return `<li>
      <div class="cop-bilgi">
        <b>${esc(buyukHarf(z.firma))}</b>
        <span class="kayit-bilgi">${planMi(z) ? "Plan" : "Ziyaret"}${z.tarih ? " · " + tarihGoster(z.tarih) : ""} · ${esc(z.silen || "")} sildi, ${kalan} gün sonra kalıcı silinecek</span>
      </div>
      <div class="cop-btn">
        <button type="button" class="btn btn-acik kucuk" data-geri="${esc(z.id)}">Geri al</button>
        <button type="button" class="btn btn-tehlike kucuk" data-kalici="${esc(z.id)}">Kalıcı sil</button>
      </div>
    </li>`;
  }).join("");
  ul.querySelectorAll("[data-geri]").forEach(b => b.onclick = async () => { await store.geriAl(b.dataset.geri); bildir("Geri alındı"); });
  ul.querySelectorAll("[data-kalici]").forEach(b => b.onclick = async () => {
    const z = silinenler.find(x => x.id === b.dataset.kalici);
    const c = await sor("Kalıcı sil", `<p><b>${esc(z?.firma)}</b> kaydı kalıcı olarak silinecek. Bu işlem geri alınamaz.</p>`,
      [{ metin: "Vazgeç", deger: false }, { metin: "Kalıcı sil", sinif: "btn-tehlike", deger: true }]);
    if (c) { await store.kaliciSil(b.dataset.kalici); bildir("Kalıcı olarak silindi"); }
  });
}
$("#copBtn").onclick = () => { copCiz(); $("#copPencere").showModal(); };
$("#copKapat").onclick = () => $("#copPencere").close();

// Pencerenin dışına (karartılmış alana) tıklayınca kapat
["#firmaPencere", "#copPencere"].forEach(s => $(s).addEventListener("click", e => { if (e.target === e.currentTarget) e.currentTarget.close(); }));

// ------------------------------------------------------------ Plan hatırlatma
// Plan tarihine 4 gün kala, tarihe kadar her gün bir kez ekranda hatırlatma gösterir.
// "Bugün gösterildi" bilgisi her cihazda ayrı tutulur.
const HATIRLATMA_ANAHTAR = "ziyaret-takip-hatirlatma";
let hatirlatmaBekleyen = [];

function hatirlatmaOku() {
  try { const v = JSON.parse(localStorage.getItem(HATIRLATMA_ANAHTAR)); if (v && v.tarih === bugun()) return v; } catch {}
  return { tarih: bugun(), idler: [] };
}
function hatirlatmaYaz(v) { try { localStorage.setItem(HATIRLATMA_ANAHTAR, JSON.stringify(v)); } catch {} }

function yaklasanPlanlar() {
  return ziyaretler.filter(z => planMi(z) && z.tarih && gunFarki(z.tarih) >= 0 && gunFarki(z.tarih) <= HATIRLATMA_GUN);
}

function kalanMetni(z) {
  const f = gunFarki(z.tarih);
  return f === 0 ? "Bugün" : f === 1 ? "Yarın" : `${f} gün kaldı`;
}

function hatirlatmaKontrol() {
  if ($("#anaEkran").hidden || document.querySelector("dialog[open]")) return;
  const liste = yaklasanPlanlar();
  const kayit = hatirlatmaOku();
  if (!liste.some(z => !kayit.idler.includes(z.id))) return;   // bugün hepsi gösterildi

  hatirlatmaBekleyen = liste.map(z => z.id);
  $("#hatirlatmaListe").innerHTML = liste.map(z => `
    <li tabindex="0" data-plan="${esc(z.id)}">
      <div class="hat-ust">
        <b>${esc(buyukHarf(z.firma))}</b>
        <span class="etiket ${gunFarki(z.tarih) === 0 ? "bugun" : ""}">${kalanMetni(z)}</span>
      </div>
      <div class="kayit-bilgi">${tarihGoster(z.tarih)}${z.saat ? " · " + esc(z.saat) : ""}${kayitSehri(z) ? " · " + esc(kayitSehri(z)) : ""}${z.katilanlar ? " · " + esc(z.katilanlar) : ""}</div>
      ${z.notlar ? `<div class="hat-not">${esc(z.notlar.split("\n")[0])}</div>` : ""}
    </li>`).join("");
  $("#hatirlatmaListe").querySelectorAll("[data-plan]").forEach(li => {
    const ac = () => {
      const z = ziyaretler.find(x => x.id === li.dataset.plan);
      $("#hatirlatmaPencere").close();
      if (z) { sekmeSec("plan"); pencereAc(z); }
    };
    li.onclick = ac;
    li.onkeydown = e => { if (e.key === "Enter") ac(); };
  });
  $("#hatirlatmaPencere").showModal();
}

// Kapatıldığında bugün için "gösterildi" olarak işaretle
$("#hatirlatmaPencere").addEventListener("close", () => {
  const kayit = hatirlatmaOku();
  kayit.idler = [...new Set([...kayit.idler, ...hatirlatmaBekleyen])];
  hatirlatmaYaz(kayit);
  hatirlatmaBekleyen = [];
});
$("#hatirlatmaKapat").onclick = () => $("#hatirlatmaPencere").close();

// Başka bir pencere kapanınca, uygulamaya geri dönülünce ve gün değişince tekrar kontrol et
document.querySelectorAll("dialog:not(#hatirlatmaPencere)").forEach(d => d.addEventListener("close", () => setTimeout(hatirlatmaKontrol, 300)));
document.addEventListener("visibilitychange", () => { if (!document.hidden) hatirlatmaKontrol(); });
setInterval(hatirlatmaKontrol, 30 * 60 * 1000);

// ------------------------------------------------------------ Excel
let excelJSYukleniyor;
function excelJS() {
  if (window.ExcelJS) return Promise.resolve(window.ExcelJS);
  excelJSYukleniyor ??= new Promise((res, rej) => {
    const s = document.createElement("script");
    s.src = "https://cdnjs.cloudflare.com/ajax/libs/exceljs/4.4.0/exceljs.min.js";
    s.onload = () => res(window.ExcelJS);
    s.onerror = () => { excelJSYukleniyor = null; rej(new Error("Excel kütüphanesi yüklenemedi (internet gerekli).")); };
    document.head.appendChild(s);
  });
  return excelJSYukleniyor;
}

$("#excelBtn").onclick = async () => {
  if (!ziyaretler.length) { bildir("İndirilecek kayıt yok"); return; }
  let kayitlar = ziyaretler, ek = "";
  if (aktifSekme === "ziyaret" && filtreAktifMi()) {
    const secili = filtreUygula(ziyaretler.filter(z => !planMi(z)));
    const s = await sor("Excel indir", `<p>Şu an bir filtre açık ve ${secili.length} ziyaret seçili. Hangisini indirmek istersin?</p>
      <p class="kayit-bilgi">Planlanan ziyaretler her iki durumda da ikinci sayfada yer alır.</p>`,
      [{ metin: "Tüm ziyaretler", deger: "tum" }, { metin: "Sadece seçili olanlar", sinif: "btn-birincil", deger: "secili" }]);
    if (!s) return;
    if (s === "secili") { kayitlar = [...secili, ...ziyaretler.filter(planMi)]; ek = "_filtreli"; }
  }
  if (window.ONIZLEME) { bildir("Önizlemede dosya indirme kapalı. GitHub'a yükleyince çalışır.", 4500); return; }
  try {
    const buf = await excelOlustur(await excelJS(), kayitlar);
    const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const ad = `Hetronic_Ziyaretler_${bugun()}${ek}.xlsx`;
    const dosya = new File([blob], ad, { type: blob.type });
    // Telefonda paylaş menüsünü aç (WhatsApp, Dosyalar vb.), olmazsa normal indir
    if (/Android|iPhone|iPad/i.test(navigator.userAgent) && navigator.canShare?.({ files: [dosya] })) {
      try { await navigator.share({ files: [dosya], title: ad }); return; } catch (e) { if (e.name === "AbortError") return; }
    }
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = ad;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    bildir("Excel indirildi");
  } catch (e) { console.error(e); bildir(e.message, 5000); }
};

$("#yukleBtn").onclick = () => $("#dosyaInput").click();
$("#dosyaInput").onchange = async e => {
  const f = e.target.files[0];
  e.target.value = "";
  if (!f) return;
  try {
    const gelen = await excelOku(await excelJS(), await f.arrayBuffer());
    const plan = birlestirmePlani(tumKayitlar, gelen);
    const elle = plan.guncellenecek.filter(u => u.elle).length;
    const planSay = gelen.filter(planMi).length;
    const satir = (n, t) => n ? `<li>${t}</li>` : "";
    const ozet = `<p><b>${esc(f.name)}</b> dosyasında ${gelen.length - planSay} ziyaret ve ${planSay} planlanan ziyaret bulundu.</p>
      <ul class="ozet-liste">
        ${satir(plan.eklenecek.length, `${plan.eklenecek.length} yeni kayıt eklenecek`)}
        ${satir(plan.guncellenecek.length, `${plan.guncellenecek.length} kayıt güncellenecek${elle ? ` (${elle} tanesi Excel'de elle düzenlenmiş)` : ""}`)}
        ${satir(plan.ayni.length, `${plan.ayni.length} kayıt zaten aynı, dokunulmayacak`)}
        ${satir(plan.cakisan.length, `${plan.cakisan.length} kayıt uygulamada daha yeni; uygulamadaki hâli korunacak`)}
        ${satir(plan.silinmis.length, `${plan.silinmis.length} kayıt silinenler kutusunda; tekrar eklenmeyecek`)}
      </ul>
      ${plan.cakisan.length ? `<p class="kayit-bilgi">Korunan: ${plan.cakisan.map(c => esc(c.mevcut.firma)).join(", ")}</p>` : ""}
      <p class="kayit-bilgi">Hiçbir kayıt silinmez.</p>`;
    if (!plan.eklenecek.length && !plan.guncellenecek.length) {
      await sor("Dosya yüklendi", ozet + "<p>Uygulama zaten güncel, yapılacak bir şey yok.</p>", [{ metin: "Tamam", sinif: "btn-birincil", deger: true }]);
      return;
    }
    const c = await sor("Dosyayı uygula", ozet, [{ metin: "Vazgeç", deger: false }, { metin: "Uygula", sinif: "btn-birincil", deger: true }]);
    if (!c) return;
    await store.topluUygula(plan);
    bildir(`${plan.eklenecek.length} eklendi, ${plan.guncellenecek.length} güncellendi`);
  } catch (err) { console.error(err); bildir("Dosya okunamadı: " + err.message, 5000); }
};

// ------------------------------------------------------------ PWA
if ("serviceWorker" in navigator && !window.ONIZLEME) {
  addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(() => {}));
}

baslat();
