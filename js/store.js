// Veri katmanı: Firebase (senkronize) veya Demo (sadece bu cihaz).
// İki sınıf da aynı arayüzü sağlar:
//   girisYap(), cikisYap(), kullaniciDinle(cb), ziyaretleriDinle(cb, hataCb)
//   ekle(veri), guncelle(id, veri, beklenenVersiyon, zorla)
//   sil(id)  -> silinenler kutusuna taşır
//   geriAl(id), kaliciSil(id), topluUygula(plan)

export class CakismaHatasi extends Error {
  constructor(sunucudaki) { super("cakisma"); this.sunucudaki = sunucudaki; }
}
export class SilinmisHatasi extends Error { constructor() { super("silinmis"); } }

const simdi = () => new Date().toISOString();
const temizle = v => ({
  tur: v.tur === "plan" ? "plan" : "ziyaret",
  firma: (v.firma || "").trim().replace(/\s+/g, " "),
  sehir: (v.sehir || "").trim(),
  adres: (v.adres || "").trim(),
  tarih: v.tarih || "",
  saat: v.saat || "",
  kisiler: (v.kisiler || []).filter(k => (k.ad || "").trim()).map(k => ({ ad: k.ad.trim(), pozisyon: (k.pozisyon || "").trim() })),
  katilanlar: (v.katilanlar || "").trim(),
  notlar: (v.notlar || "").trim()
});

// ---------------------------------------------------------------- DEMO
export class DemoStore {
  constructor() {
    this.demo = true;
    this.anahtar = "ziyaret-takip-demo";
    this.dinleyiciler = [];
    this.kullanici = { displayName: "Demo Kullanıcı", email: "demo", photoURL: "" };
  }
  _oku() { try { return JSON.parse(localStorage.getItem(this.anahtar)) || []; } catch { return []; } }
  _yaz(l) { try { localStorage.setItem(this.anahtar, JSON.stringify(l)); } catch {} this.dinleyiciler.forEach(cb => cb(l, { yerelBekleyen: false })); }
  _degistir(id, fn) {
    const l = this._oku(); const i = l.findIndex(z => z.id === id);
    if (i === -1) return;
    l[i] = { ...l[i], ...fn(l[i]), versiyon: (l[i].versiyon || 0) + 1 }; this._yaz(l);
  }
  async girisYap() {}
  async cikisYap() {}
  kullaniciDinle(cb) { setTimeout(() => cb(this.kullanici), 0); }
  ziyaretleriDinle(cb) { this.dinleyiciler.push(cb); setTimeout(() => cb(this._oku(), { yerelBekleyen: false }), 0); return () => {}; }
  async ekle(v) {
    const l = this._oku();
    const kayit = { ...temizle(v), id: "d" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      olusturan: this.kullanici.displayName, olusturmaZamani: simdi(),
      guncelleyen: this.kullanici.displayName, guncellemeZamani: simdi(), versiyon: 1 };
    l.push(kayit); this._yaz(l); return kayit.id;
  }
  async guncelle(id, v, beklenen, zorla = false) {
    const l = this._oku(); const i = l.findIndex(z => z.id === id);
    if (i === -1 || l[i].silindi) throw new SilinmisHatasi();
    if (!zorla && l[i].versiyon !== beklenen) throw new CakismaHatasi(l[i]);
    l[i] = { ...l[i], ...temizle(v), guncelleyen: this.kullanici.displayName, guncellemeZamani: simdi(), versiyon: (l[i].versiyon || 0) + 1 };
    this._yaz(l);
  }
  async sil(id) { this._degistir(id, () => ({ silindi: true, silinmeZamani: simdi(), silen: this.kullanici.displayName })); }
  async geriAl(id) { this._degistir(id, () => ({ silindi: false, silinmeZamani: "", silen: "" })); }
  async kaliciSil(id) { this._yaz(this._oku().filter(z => z.id !== id)); }
  async topluUygula(plan) {
    for (const g of plan.eklenecek) await this.ekle(g);
    for (const u of plan.guncellenecek) await this.guncelle(u.mevcut.id, u.yeni, 0, true);
  }
}

// ---------------------------------------------------------------- FIREBASE
const FB = "https://www.gstatic.com/firebasejs/10.14.1/";

export class FirebaseStore {
  constructor(config) { this.demo = false; this.config = config; }

  async baslat() {
    const [appM, authM, fsM] = await Promise.all([
      import(FB + "firebase-app.js"), import(FB + "firebase-auth.js"), import(FB + "firebase-firestore.js")
    ]);
    this.a = authM; this.f = fsM;
    const app = appM.initializeApp(this.config);
    this.auth = authM.getAuth(app);
    this.db = fsM.initializeFirestore(app, {
      localCache: fsM.persistentLocalCache({ tabManager: fsM.persistentMultipleTabManager() })
    });
    this.koleksiyon = fsM.collection(this.db, "ziyaretler");
    try { await authM.getRedirectResult(this.auth); } catch {}
  }

  get kullanici() { const u = this.auth && this.auth.currentUser; return u ? { displayName: u.displayName || u.email, email: u.email } : null; }
  _isim() { const u = this.auth.currentUser; return (u && (u.displayName || u.email)) || "Bilinmiyor"; }

  async girisYap() {
    const p = new this.a.GoogleAuthProvider();
    p.setCustomParameters({ prompt: "select_account" });
    try { await this.a.signInWithPopup(this.auth, p); }
    catch (e) {
      if (["auth/popup-blocked", "auth/operation-not-supported-in-this-environment"].includes(e.code))
        await this.a.signInWithRedirect(this.auth, p);
      else if (e.code !== "auth/popup-closed-by-user" && e.code !== "auth/cancelled-popup-request") throw e;
    }
  }
  cikisYap() { return this.a.signOut(this.auth); }
  kullaniciDinle(cb) { this.a.onAuthStateChanged(this.auth, cb); }

  ziyaretleriDinle(cb, hataCb) {
    return this.f.onSnapshot(this.koleksiyon, { includeMetadataChanges: true }, snap => {
      const liste = snap.docs.map(d => ({ ...d.data(), id: d.id }));
      cb(liste, { yerelBekleyen: snap.metadata.hasPendingWrites, onbellekten: snap.metadata.fromCache });
    }, hataCb);
  }

  async ekle(v) {
    const ref = this.f.doc(this.koleksiyon);
    const isim = this._isim();
    // Çevrimdışıyken await sonsuza kadar bekleyebilir; yazma yerel olarak hemen uygulanır.
    this.f.setDoc(ref, { ...temizle(v), olusturan: isim, olusturmaZamani: simdi(),
      guncelleyen: isim, guncellemeZamani: simdi(), versiyon: 1 }).catch(e => console.error(e));
    return ref.id;
  }

  async guncelle(id, v, beklenen, zorla = false) {
    const ref = this.f.doc(this.koleksiyon, id);
    const yeni = { ...temizle(v), guncelleyen: this._isim(), guncellemeZamani: simdi() };
    if (navigator.onLine) {
      try {
        await this.f.runTransaction(this.db, async tx => {
          const s = await tx.get(ref);
          if (!s.exists() || s.data().silindi) throw new SilinmisHatasi();
          const mevcutV = s.data().versiyon || 0;
          if (!zorla && mevcutV !== beklenen) throw new CakismaHatasi({ ...s.data(), id });
          tx.update(ref, { ...yeni, versiyon: mevcutV + 1 });
        });
        return;
      } catch (e) {
        if (e instanceof CakismaHatasi || e instanceof SilinmisHatasi) throw e;
        if (e.code !== "unavailable" && e.code !== "failed-precondition") throw e;
        // bağlantı sorunu: aşağıdaki çevrimdışı yola düş
      }
    }
    // Çevrimdışı: yerel önbellekteki sürümle karşılaştır, sonra yaz
    const s = await this.f.getDoc(ref).catch(() => null);
    if (s && s.exists()) {
      if (s.data().silindi) throw new SilinmisHatasi();
      const mevcutV = s.data().versiyon || 0;
      if (!zorla && mevcutV !== beklenen) throw new CakismaHatasi({ ...s.data(), id });
      this.f.updateDoc(ref, { ...yeni, versiyon: mevcutV + 1 }).catch(e => console.error(e));
    } else {
      this.f.updateDoc(ref, { ...yeni, versiyon: (beklenen || 0) + 1 }).catch(e => console.error(e));
    }
  }

  _yamala(id, alanlar) {
    this.f.updateDoc(this.f.doc(this.koleksiyon, id), { ...alanlar, versiyon: this.f.increment(1) }).catch(e => console.error(e));
  }
  async sil(id) { this._yamala(id, { silindi: true, silinmeZamani: simdi(), silen: this._isim() }); }
  async geriAl(id) { this._yamala(id, { silindi: false, silinmeZamani: "", silen: "", guncelleyen: this._isim(), guncellemeZamani: simdi() }); }
  async kaliciSil(id) { this.f.deleteDoc(this.f.doc(this.koleksiyon, id)).catch(e => console.error(e)); }

  async topluUygula(plan) {
    const isim = this._isim();
    const islemler = [];
    for (const g of plan.eklenecek)
      islemler.push(b => b.set(this.f.doc(this.koleksiyon), { ...temizle(g), olusturan: isim, olusturmaZamani: simdi(),
        guncelleyen: isim, guncellemeZamani: simdi(), versiyon: 1 }));
    for (const u of plan.guncellenecek)
      islemler.push(b => b.update(this.f.doc(this.koleksiyon, u.mevcut.id), { ...temizle(u.yeni),
        guncelleyen: isim, guncellemeZamani: simdi(), versiyon: (u.mevcut.versiyon || 0) + 1 }));
    // Firestore toplu yazma sınırı 500
    for (let i = 0; i < islemler.length; i += 400) {
      const b = this.f.writeBatch(this.db);
      islemler.slice(i, i + 400).forEach(fn => fn(b));
      b.commit().catch(e => console.error(e));
    }
  }
}
