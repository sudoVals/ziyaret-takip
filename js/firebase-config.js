// ============================================================
//  FIREBASE AYARLARI
//  Kurulum rehberindeki (KURULUM.md) adımları izleyip
//  Firebase konsolundan aldığın değerleri buraya yapıştır.
//
//  Değerler "BURAYA" ile başladığı sürece uygulama DEMO MODUNDA
//  çalışır: veriler sadece o cihazda tutulur, senkronize olmaz.
// ============================================================

export const firebaseConfig = {
  apiKey: "BURAYA_API_KEY",
  authDomain: "BURAYA.firebaseapp.com",
  projectId: "BURAYA",
  storageBucket: "BURAYA.appspot.com",
  messagingSenderId: "BURAYA",
  appId: "BURAYA"
};

// Uygulamaya girebilecek Google hesapları (küçük harfle yaz).
// Asıl koruma Firestore kurallarındadır; bu liste sadece
// yetkisiz biri girerse ona düzgün bir mesaj göstermek içindir.
export const IZINLI_EPOSTALAR = [
  "senin.adresin@gmail.com",
  "patronun.adresi@gmail.com"
];
