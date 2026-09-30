import { isNepalPlace } from './nepalPlaces';
import { sanitizeCheckoutWords } from './validation';

// Keep these lists and rules in sync with server/deliveryAddress.js.
export const PROVINCES = [
  'Bagmati Province',
  'Gandaki Province',
  'Karnali Province',
  'Koshi Province',
  'Lumbini Province',
  'Madhesh Province',
  'Sudurpashchim Province',
];

export const DELIVERY_CITIES = [
  'Baiteshwar - Mainapokhari',
  'Bakaiya - Phaparbari',
  'Banepa',
  'Barhabise',
  'Benighat Rorang - Charaudi',
  'Bhaktapur',
  'Bharatpur',
  'Bharatpur - Jagatpur',
  'Bharatpur - Meghauli',
  'Bhimeshwor - Charikot',
  'Bhimphedi',
  'Bidur',
  'Bigu - Singati',
  'Chautara Sangachokgadhi - Chautara',
  'Dhulikhel',
  'Dhunibeshi',
  'Dhunibeshi - Dharke',
  'Dudhauli',
  'Gajuri',
  'Galchhi',
  'Gokulganga',
  'Gosaikund - Dhunche',
  'Helambu',
  'Hetauda',
  'Hetauda - Chaughada Bazar',
  'Hetauda - Makwanpurgadhi',
  'Ichchhakamana - Kurintar',
  'Ichchhakamana - Munglin',
  'Indrawati',
  'Jiri',
  'Kalika',
  'Kalika - Padampur',
  'Kamalamai - Bhiman',
  'Kathmandu Metro 10 - New Baneshwor Area',
  'Kathmandu Metro 11 - Maitighar Area',
  'Kathmandu Metro 12 - Teku Area',
  'Kathmandu Metro 13 - Kalimati Area',
  'Kathmandu Metro 14 - Kuleshwor Area',
  'Kathmandu Metro 15 - Swayambhu Area',
  'Kathmandu Metro 16 - Nayabazar Area',
  'Kathmandu Metro 17 - Chhetrapati Area',
  'Kathmandu Metro 18 - Raktakali Area',
  'Kathmandu Metro 19 - Hanumandhoka Area',
  'Kathmandu Metro 1 - Naxal Area',
  'Kathmandu Metro 20 - Marutol Area',
  'Kathmandu Metro 21 - Lagantole Area',
  'Kathmandu Metro 22 - Newroad Area',
  'Kathmandu Metro 23 - Basantapur Area',
  'Kathmandu Metro 24 - Indrachowk Area',
  'Kathmandu Metro 25 - Ason Area',
  'Kathmandu Metro 26 - Samakhusi Area',
  'Kathmandu Metro 26 - Thamel Area',
  'Kathmandu Metro 27 - Bhotahiti Area',
  'Kathmandu Metro 28 - Bagbazar Area',
  'Kathmandu Metro 28 - Kamaladi Area',
  'Kathmandu Metro 29 - Anamnagar Area',
  'Kathmandu Metro 29 - Putalisadak Area',
  'Kathmandu Metro 2 - Lazimpat Area',
  'Kathmandu Metro 30 - Maitidevi Area',
  'Kathmandu Metro 31 - Min Bhawan Area',
  'Kathmandu Metro 32 - Koteshwor Area',
  'Kathmandu Metro 32 - Tinkune Area',
  'Kathmandu Metro 3 - Baluwatar Area',
  'Kathmandu Metro 3 - Maharajgunj Area',
  'Kathmandu Metro 4 - Bishalnagar Area',
  'Kathmandu Metro 5 - Tangal Area',
  'Kathmandu Metro 7 - Chabahil Area',
  'Kathmandu Metro 8 - Gaushala Area',
  'Kathmandu Metro 9 - Sinamangal Area',
  'Kathmandu Outside Ring Road',
  'Khairehani',
  'Khandadevi',
  'Lalitpur Inside Ring Road',
  'Lalitpur Outside Ring Road',
  'Likhu Tamakoshi - Khimti',
  'Likhu Tamakoshi - Likhu Dhobi',
  'Madi (Chitwan)',
  'Mandan Deupur - Kuntabesi',
  'Manthali',
  'Melamchi',
  'Nagarkot',
  'Namobuddha - Bhakundebesi',
  'Nilkantha - Dhading',
  'Panauti',
  'Panchkhal',
  'Ramechhap - Ramechhap Bazar',
  'Rapti',
  'Ratnanagar',
  'Sindhuli-Kamalamai',
  'Sunkoshi (Sindhuli) - Khurkot',
  'Thaha - Daman',
];

export const ADDRESS_LABELS = ['Home', 'Office'];

const WORDS_REGEX = /^[\p{L}\p{M}]+(?: [\p{L}\p{M}]+)*$/u;
const PHONE_REGEX = /^(97|98)\d{8}$/;

export const sanitizeWords = sanitizeCheckoutWords;
export const sanitizePhone = (value) => String(value || '').replace(/\D/g, '').slice(0, 10);

export const isValidAddressName = (value) => {
  const trimmed = String(value || '').trim();
  return trimmed.length >= 2 && trimmed.length <= 60 && WORDS_REGEX.test(trimmed);
};
export const isValidAddressPhone = (value) => PHONE_REGEX.test(String(value || '').trim());

export const emptyAddressDraft = {
  fullName: '',
  phone: '',
  landmark: '',
  province: '',
  city: '',
  address: '',
  label: 'Home',
};

/** Field errors for the address form; messages stay general on purpose. */
export function validateDeliveryAddress(draft) {
  const errors = {};
  if (!String(draft.fullName || '').trim()) errors.fullName = 'Full name is required.';
  else if (!isValidAddressName(draft.fullName)) errors.fullName = 'Please enter a valid name.';

  if (!String(draft.phone || '').trim()) errors.phone = 'Phone number is required.';
  else if (!isValidAddressPhone(draft.phone)) errors.phone = 'Please enter a valid phone number.';

  if (!PROVINCES.includes(draft.province)) errors.province = 'Please choose your province / region.';
  if (!DELIVERY_CITIES.includes(draft.city)) errors.city = 'Please choose your city.';

  const address = String(draft.address || '').trim();
  if (!address) errors.address = 'Address is required.';
  else if (address.length < 3 || address.length > 120 || !WORDS_REGEX.test(address)) errors.address = 'Please enter a valid address.';

  const landmark = String(draft.landmark || '').trim();
  if (landmark && (landmark.length > 120 || !WORDS_REGEX.test(landmark))) errors.landmark = 'Please enter a valid landmark.';

  return errors;
}

/** Brings older saved addresses (title / location / address) into the current shape for display and editing. */
export function toAddressDraft(entry = {}) {
  const label = ADDRESS_LABELS.find((item) => item.toLowerCase() === String(entry.label || entry.title || '').toLowerCase()) || 'Home';
  return {
    fullName: sanitizeWords(entry.fullName || '').trim(),
    phone: sanitizePhone(entry.phone),
    landmark: sanitizeWords(entry.landmark || '').trim(),
    province: PROVINCES.includes(entry.province) ? entry.province : '',
    city: DELIVERY_CITIES.includes(entry.city) ? entry.city : DELIVERY_CITIES.includes(entry.location) ? entry.location : '',
    address: sanitizeWords(entry.address || '').trim(),
    label,
  };
}

/** Starting values for a new address: whatever the customer already gave us before. */
export function prefillAddressDraft(user, addresses = []) {
  const last = addresses.length ? toAddressDraft(addresses[addresses.length - 1]) : null;
  const profileName = sanitizeWords(user?.name || user?.fullName || '').trim();
  const profilePhone = sanitizePhone(user?.phone);
  return {
    ...emptyAddressDraft,
    fullName: last?.fullName || (isValidAddressName(profileName) ? profileName : ''),
    phone: last?.phone || (isValidAddressPhone(profilePhone) ? profilePhone : ''),
    province: last?.province || '',
    city: last?.city || '',
  };
}

/** Checkout accepts letters only and a recognised Nepal place, so the saved city is reduced to that form. */
export function checkoutLocationOf(entry = {}) {
  const city = sanitizeWords(String(entry.city || entry.location || '').replace(/[-()]/g, ' ')).trim();
  if (city && isNepalPlace(city)) return city;
  const province = sanitizeWords(String(entry.province || '').replace(/ Province$/i, '')).trim();
  const combined = [city, province].filter(Boolean).join(' ');
  return combined && isNepalPlace(combined) ? combined : city;
}
