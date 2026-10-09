// Yazım düzeltmeleri (Türkçe harf kurallarıyla: i -> İ, ı -> I)

const TR = "tr";

// Firma adı: tamamı büyük harf
export const buyukHarf = s => String(s || "").toLocaleUpperCase(TR);

// İsim, şehir gibi alanlar: her kelimenin ilk harfi büyük ("ali yılmaz" -> "Ali Yılmaz")
// Diğer harflere dokunmaz (kısaltmalar bozulmasın).
export const kelimeBasi = s => String(s || "").replace(/(^|[\s\-'(\/,])(\p{Ll})/gu, (_, once, harf) => once + harf.toLocaleUpperCase(TR));

// Not, adres, pozisyon gibi alanlar: her cümlenin ilk harfi büyük
// Cümle başı: metnin başı, satır başı, ". ! ?" sonrasındaki ilk harf.
export const cumleBasi = s => String(s || "").replace(/(^|[.!?]\s+|\n\s*)(\p{Ll})/gu, (_, once, harf) => once + harf.toLocaleUpperCase(TR));
