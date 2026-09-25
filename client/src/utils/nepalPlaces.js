/**
 * Nepal districts + common city/locality names for delivery location checks.
 * Matching is case-insensitive and allows forms like "Thamel, Kathmandu".
 */
const NEPAL_PLACES_RAW = [
  // Major cities / metro
  'Kathmandu', 'Pokhara', 'Lalitpur', 'Patan', 'Bhaktapur', 'Biratnagar', 'Birgunj',
  'Butwal', 'Dharan', 'Nepalgunj', 'Hetauda', 'Janakpur', 'Dhangadhi', 'Itahari',
  'Bharatpur', 'Chitwan', 'Damak', 'Bhadrapur', 'Tulsipur', 'Ghorahi', 'Siddharthanagar',
  'Bhairahawa', 'Tikapur', 'Rajbiraj', 'Lahan', 'Birendranagar', 'Surkhet', 'Jumla',
  'Jomsom', 'Namche Bazaar', 'Lukla', 'Bandipur', 'Tansen', 'Palpa', 'Gorkha',
  // Kathmandu Valley localities
  'Thamel', 'Baneshwor', 'New Baneshwor', 'Old Baneshwor', 'Koteshwor', 'Kalanki',
  'Balaju', 'Gongabu', 'Maharajgunj', 'Lazimpat', 'Durbarmarg', 'New Road', 'Asan',
  'Basantapur', 'Swayambhu', 'Boudha', 'Bouddha', 'Chabahil', 'Gaushala', 'Sinamangal',
  'Airport', 'Tinkune', 'Imadol', 'Gwarko', 'Jawalakhel', 'Pulchowk', 'Kupondole',
  'Patandhoka', 'Lagankhel', 'Satdobato', 'Kumaripati', 'Sanepa', 'Ekantakuna',
  'Balkhu', 'Kirtipur', 'Tokha', 'Budhanilkantha', 'Chandragiri', 'Thankot', 'Suryabinayak',
  'Madhyapur Thimi', 'Thimi', 'Changunarayan', 'Nagarkot', 'Dhulikhel', 'Banepa',
  'Panauti', 'Nala', 'Sankhu', 'Godawari', 'Chapagaun', 'Lubhu', 'Bungamati', 'Khokana',
  // Districts (77)
  'Achham', 'Arghakhanchi', 'Baglung', 'Baitadi', 'Bajhang', 'Bajura', 'Banke', 'Bara',
  'Bardiya', 'Bhaktapur', 'Bhojpur', 'Chitwan', 'Dadeldhura', 'Dailekh', 'Dang',
  'Darchula', 'Dhading', 'Dhankuta', 'Dhanusha', 'Dolakha', 'Dolpa', 'Doti', 'Eastern Rukum',
  'Gorkha', 'Gulmi', 'Humla', 'Ilam', 'Jajarkot', 'Jhapa', 'Jumla', 'Kailali', 'Kalikot',
  'Kanchanpur', 'Kapilvastu', 'Kaski', 'Kathmandu', 'Kavrepalanchok', 'Khotang', 'Lalitpur',
  'Lamjung', 'Mahottari', 'Makwanpur', 'Manang', 'Morang', 'Mugu', 'Mustang', 'Myagdi',
  'Nawalparasi East', 'Nawalparasi West', 'Nawalpur', 'Parasi', 'Nuwakot', 'Okhaldhunga',
  'Palpa', 'Panchthar', 'Parbat', 'Parsa', 'Pyuthan', 'Ramechhap', 'Rasuwa', 'Rautahat',
  'Rolpa', 'Western Rukum', 'Rupandehi', 'Salyan', 'Sankhuwasabha', 'Saptari', 'Sarlahi',
  'Sindhuli', 'Sindhupalchok', 'Siraha', 'Solukhumbu', 'Sunsari', 'Surkhet', 'Syangja',
  'Tanahun', 'Taplejung', 'Tehrathum', 'Terhathum', 'Udayapur',
  // Country / province shortcuts
  'Nepal', 'Bagmati', 'Gandaki', 'Lumbini', 'Karnali', 'Sudurpashchim', 'Madhesh', 'Koshi',
];

export const NEPAL_PLACES = [...new Set(NEPAL_PLACES_RAW.map((p) => p.trim()).filter(Boolean))]
  .sort((a, b) => a.localeCompare(b));

export function normalizePlaceToken(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function isNepalPlace(value) {
  const raw = String(value || '').trim();
  if (!raw) return false;

  const normalized = normalizePlaceToken(raw);
  if (normalized.length < 2) return false;

  const tokens = normalized.split(/[,\-/|]+/).map((part) => part.trim()).filter(Boolean);
  const haystacks = tokens.length ? tokens : [normalized];

  return haystacks.some((token) =>
    NEPAL_PLACES.some((place) => {
      const placeNorm = normalizePlaceToken(place);
      if (!placeNorm) return false;
      if (token === placeNorm) return true;
      if (token.includes(placeNorm) && placeNorm.length >= 3) return true;
      if (placeNorm.includes(token) && token.length >= 4) return true;
      return false;
    })
  );
}
