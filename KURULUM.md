# Ziyaret Takip – Kurulum Rehberi

Toplam süre yaklaşık 20 dakika. Hepsi tarayıcıdan, fareyle yapılır; terminal gerekmez.

Kurulumdan önce de uygulamayı deneyebilirsin: Firebase ayarı yapılmadığı sürece uygulama "Demo modu"nda açılır, veriler sadece o cihazda tutulur.

---

## 1. Firebase projesi oluştur

1. https://console.firebase.google.com adresine git, Google hesabınla giriş yap.
2. "Proje oluştur" (Create a project) düğmesine bas.
3. Proje adı: `hetronic-ziyaret` (istediğin bir ad olabilir). Devam.
4. Google Analytics sorulursa kapat (gerek yok). "Proje oluştur".

## 2. Google ile girişi aç

1. Sol menüde "Derleme" (Build) > "Authentication" > "Başlayın" (Get started).
2. "Sign-in method" sekmesinde "Google"ı seç.
3. "Etkinleştir" anahtarını aç, destek e-postası olarak kendi adresini seç, "Kaydet".

## 3. Veritabanını (Firestore) oluştur

1. Sol menüde "Derleme" > "Firestore Database" > "Veritabanı oluştur".
2. Konum olarak `eur3 (europe-west)` seç.
3. "Üretim modunda başlat" (Start in production mode) seç, "Oluştur".
4. Üstteki "Kurallar" (Rules) sekmesine geç.
5. Oradaki her şeyi sil, proje klasöründeki `firestore.rules` dosyasının içeriğini yapıştır.
6. İki e-posta adresini kendi adresin ve patronunun Gmail adresiyle değiştir (küçük harfle).
7. "Yayınla" (Publish).

Bu adım çok önemli: veriler sadece bu iki hesap tarafından görülebilir hale gelir.

## 4. Web uygulamasını kaydet ve ayarları al

1. Sol üstte dişli simgesi > "Proje ayarları".
2. Aşağıda "Uygulamalarınız" bölümünde `</>` (Web) simgesine bas.
3. Takma ad: `ziyaret-web`. "Firebase Hosting" kutusunu işaretleme. "Uygulamayı kaydet".
4. Ekranda `const firebaseConfig = { ... }` şeklinde bir blok çıkacak. Bu değerleri kopyala.
5. Proje klasöründe `js/firebase-config.js` dosyasını aç (Not Defteri, VS Code ya da Qt Creator ile).
6. `BURAYA...` yazan yerlere kopyaladığın değerleri yapıştır.
7. Aynı dosyadaki `IZINLI_EPOSTALAR` listesine de aynı iki e-postayı yaz. Kaydet.

Not: Bu ayarların public GitHub'da görünmesi normaldir ve güvenlidir. Verileri koruyan şey 3. adımdaki kurallardır.

## 5. GitHub'a yükle

1. https://github.com/new adresinde yeni repo oluştur. Ad: `ziyaret-takip`, "Public" seç, "Create repository".
2. Açılan sayfada "uploading an existing file" bağlantısına tıkla.
3. Proje klasörünün İÇİNDEKİ tüm dosya ve klasörleri (index.html, css, js, icons, manifest.json, sw.js ...) sürükleyip bırak.
4. Altta "Commit changes".
5. Repo sayfasında "Settings" > soldan "Pages".
6. "Branch" altında `main` ve `/ (root)` seç, "Save".
7. 1–2 dakika sonra adres hazır olur: `https://KULLANICI_ADIN.github.io/ziyaret-takip/`

## 6. GitHub adresini Firebase'e tanıt

Bunu yapmazsan Google girişi "unauthorized domain" hatası verir.

1. Firebase konsolu > "Authentication" > "Settings" (Ayarlar) sekmesi > "Authorized domains".
2. "Add domain" > `KULLANICI_ADIN.github.io` yaz (sadece bu kısım, https ve klasör adı olmadan). Ekle.

## 7. Telefona uygulama olarak ekle

Android (Chrome): Adresi aç > sağ üst üç nokta > "Uygulamayı yükle" veya "Ana ekrana ekle".

iPhone (Safari): Adresi aç > alttaki paylaş simgesi > "Ana Ekrana Ekle".

Patronun da aynı adresi açıp kendi Google hesabıyla giriş yapar.

---

## Günlük kullanım

- Sağ alttaki + ile yeni ziyaret eklenir. Listede bir ziyarete dokununca detayı açılır, düzenleyip "Kaydet"e basılır.
- İki sekme var: "Ziyaret edilenler" ve "Planlanan ziyaretler". + düğmesi hangi sekmedeysen oraya ekler.
- Planlanan ziyarette tarih boş bırakılabilir. Listede "14 gün sonra", "Bugün", "Tarihi geçti" gibi etiketler görünür.
- Planlanan ziyarete gidildiğinde kaydı açıp "Ziyaret gerçekleşti"ye bas. Tarih bugüne ayarlanır, plan notu korunur; görüşme notlarını ekleyip "Kaydet"e basınca kayıt ziyaret edilenlere taşınır.
- "Firmalar" sekmesi: daha önce girilen her firma burada listelenir. Bir firmaya dokununca konumu, tanışılan kişiler ve tüm ziyaret geçmişi (notlarıyla birlikte) açılır.
- Yeni kayıtta firma adını yazınca o firmanın geçmişi gösterilir, şehir ve adres otomatik dolar, kişi adı yazarken o firmanın kişileri önerilir ve pozisyon kendiliğinden gelir.
- Şehir veya adres girilen kayıtlarda "Haritada aç" ile Google Haritalar'da yol tarifi alınır.
- "Rapor" sekmesi: seçilen dönem, şehir ya da ziyaret eden kişiye göre ziyaret sayıları, aylara göre grafik ve en çok gidilen firmalar. Aynı filtreler "Ziyaretler" sekmesinde de çalışır; filtre açıkken Excel indirirken sadece seçilenleri indirmeyi seçebilirsin.
- Silinen kayıtlar sayfanın altındaki "Silinenler kutusu"na gider ve 30 gün boyunca geri alınabilir. 30 gün sonra kendiliğinden kalıcı olarak silinir.
- Sağ üstteki nokta: yeşil = senkronize, turuncu yanıp sönüyor = gönderiliyor, kırmızı = çevrimdışı (bağlantı gelince kendisi gönderir).
- "Excel indir": tek Excel dosyası indirir. İlk sayfada ziyaret edilenler (her ziyaret tek satır, şehir ve adres dahil), ikinci sayfada planlanan ziyaretler bulunur. Telefonda paylaş menüsü açılır (WhatsApp, Dosyalar, e-posta).
- "Dosya yükle": daha önce indirilmiş (ya da Excel'de elle düzeltilmiş) dosyayı yükler. Ne ekleneceği ve ne güncelleneceği önce gösterilir, onay verince uygulanır. Hiçbir kayıt silinmez.
- Aynı ziyareti ikiniz aynı anda düzenlerseniz, ikinci kaydeden kişiye uyarı çıkar ve hangisinin kalacağını seçer.

## Uygulamayı güncellersen

GitHub'daki dosyaları değiştirdiğinde `sw.js` içindeki `SURUM` değerini artır (ör. `ziyaret-v2`), böylece telefonlardaki eski sürüm yenilenir.

## Excel'deki gizli sütunlar

Excel'de "Kayıt ID" ve "Güncelleme ISO" diye iki gizli sütun var. Dosya geri yüklendiğinde hangi satırın hangi ziyarete ait olduğunu bunlarla anlıyoruz. Silmeyin; Excel'de elle yeni satır eklerseniz bu sütunları boş bırakmanız yeterli.
