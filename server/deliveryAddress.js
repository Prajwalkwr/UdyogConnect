// Keep these lists and rules in sync with client/src/utils/deliveryAddress.js.
const PROVINCES = [
  'Bagmati Province',
  'Gandaki Province',
  'Karnali Province',
  'Koshi Province',
  'Lumbini Province',
  'Madhesh Province',
  'Sudurpashchim Province',
];

const DELIVERY_CITIES = [
  'Baiteshwar - Mainapokhari', 'Bakaiya - Phaparbari', 'Banepa', 'Barhabise', 'Benighat Rorang - Charaudi',
  'Bhaktapur', 'Bharatpur', 'Bharatpur - Jagatpur', 'Bharatpur - Meghauli', 'Bhimeshwor - Charikot',
  'Bhimphedi', 'Bidur', 'Bigu - Singati', 'Chautara Sangachokgadhi - Chautara', 'Dhulikhel', 'Dhunibeshi',
  'Dhunibeshi - Dharke', 'Dudhauli', 'Gajuri', 'Galchhi', 'Gokulganga', 'Gosaikund - Dhunche', 'Helambu',
  'Hetauda', 'Hetauda - Chaughada Bazar', 'Hetauda - Makwanpurgadhi', 'Ichchhakamana - Kurintar',
  'Ichchhakamana - Munglin', 'Indrawati', 'Jiri', 'Kalika', 'Kalika - Padampur', 'Kamalamai - Bhiman',
  'Kathmandu Metro 10 - New Baneshwor Area', 'Kathmandu Metro 11 - Maitighar Area', 'Kathmandu Metro 12 - Teku Area',
  'Kathmandu Metro 13 - Kalimati Area', 'Kathmandu Metro 14 - Kuleshwor Area', 'Kathmandu Metro 15 - Swayambhu Area',
  'Kathmandu Metro 16 - Nayabazar Area', 'Kathmandu Metro 17 - Chhetrapati Area', 'Kathmandu Metro 18 - Raktakali Area',
  'Kathmandu Metro 19 - Hanumandhoka Area', 'Kathmandu Metro 1 - Naxal Area', 'Kathmandu Metro 20 - Marutol Area',
  'Kathmandu Metro 21 - Lagantole Area', 'Kathmandu Metro 22 - Newroad Area', 'Kathmandu Metro 23 - Basantapur Area',
  'Kathmandu Metro 24 - Indrachowk Area', 'Kathmandu Metro 25 - Ason Area', 'Kathmandu Metro 26 - Samakhusi Area',
  'Kathmandu Metro 26 - Thamel Area', 'Kathmandu Metro 27 - Bhotahiti Area', 'Kathmandu Metro 28 - Bagbazar Area',
  'Kathmandu Metro 28 - Kamaladi Area', 'Kathmandu Metro 29 - Anamnagar Area', 'Kathmandu Metro 29 - Putalisadak Area',
  'Kathmandu Metro 2 - Lazimpat Area', 'Kathmandu Metro 30 - Maitidevi Area', 'Kathmandu Metro 31 - Min Bhawan Area',
  'Kathmandu Metro 32 - Koteshwor Area', 'Kathmandu Metro 32 - Tinkune Area', 'Kathmandu Metro 3 - Baluwatar Area',
  'Kathmandu Metro 3 - Maharajgunj Area', 'Kathmandu Metro 4 - Bishalnagar Area', 'Kathmandu Metro 5 - Tangal Area',
  'Kathmandu Metro 7 - Chabahil Area', 'Kathmandu Metro 8 - Gaushala Area', 'Kathmandu Metro 9 - Sinamangal Area',
  'Kathmandu Outside Ring Road', 'Khairehani', 'Khandadevi', 'Lalitpur Inside Ring Road', 'Lalitpur Outside Ring Road',
  'Likhu Tamakoshi - Khimti', 'Likhu Tamakoshi - Likhu Dhobi', 'Madi (Chitwan)', 'Mandan Deupur - Kuntabesi',
  'Manthali', 'Melamchi', 'Nagarkot', 'Namobuddha - Bhakundebesi', 'Nilkantha - Dhading', 'Panauti', 'Panchkhal',
  'Ramechhap - Ramechhap Bazar', 'Rapti', 'Ratnanagar', 'Sindhuli-Kamalamai', 'Sunkoshi (Sindhuli) - Khurkot',
  'Thaha - Daman',
];

const ADDRESS_LABELS = ['Home', 'Office'];
const MAX_ADDRESSES = 10;
const WORDS_REGEX = /^[\p{L}\p{M}]+(?: [\p{L}\p{M}]+)*$/u;
const PHONE_REGEX = /^(97|98)\d{8}$/;
const ID_REGEX = /^[A-Za-z0-9_-]{1,40}$/;

const text = (value) => (typeof value === 'string' ? value.trim() : '');
const isWords = (value, min, max) => value.length >= min && value.length <= max && WORDS_REGEX.test(value);
const isStructured = (entry) => ['fullName', 'province', 'city', 'label'].some((key) => entry[key] !== undefined);

/** Addresses saved before the structured form keep working, trimmed to plain short strings. */
function legacyAddress(entry, index) {
  return {
    _id: ID_REGEX.test(String(entry._id || '')) ? String(entry._id) : `addr_${Date.now()}_${index}`,
    title: text(entry.title).slice(0, 30) || 'Home',
    location: text(entry.location).slice(0, 80),
    address: text(entry.address).slice(0, 160),
  };
}

/**
 * Validates the customer's address book before it is saved.
 * Returns { addresses } on success or { error } with a general message.
 */
function validateAddressList(input) {
  if (!Array.isArray(input)) return { error: 'Addresses must be a list.' };
  if (input.length > MAX_ADDRESSES) return { error: `You can save up to ${MAX_ADDRESSES} addresses.` };

  const addresses = [];
  for (let index = 0; index < input.length; index += 1) {
    const entry = input[index];
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return { error: 'Invalid address.' };
    if (!isStructured(entry)) {
      addresses.push(legacyAddress(entry, index));
      continue;
    }

    const fullName = text(entry.fullName);
    const phone = text(entry.phone);
    const province = text(entry.province);
    const city = text(entry.city);
    const address = text(entry.address);
    const landmark = text(entry.landmark);
    const label = ADDRESS_LABELS.find((item) => item.toLowerCase() === text(entry.label).toLowerCase());

    if (!isWords(fullName, 2, 60)) return { error: 'Please enter a valid name.' };
    if (!PHONE_REGEX.test(phone)) return { error: 'Please enter a valid phone number.' };
    if (!PROVINCES.includes(province)) return { error: 'Please choose a valid province / region.' };
    if (!DELIVERY_CITIES.includes(city)) return { error: 'Please choose a valid city.' };
    if (!isWords(address, 3, 120)) return { error: 'Please enter a valid address.' };
    if (landmark && !isWords(landmark, 1, 120)) return { error: 'Please enter a valid landmark.' };
    if (!label) return { error: 'Please choose Home or Office.' };

    addresses.push({
      _id: ID_REGEX.test(String(entry._id || '')) ? String(entry._id) : `addr_${Date.now()}_${index}`,
      fullName,
      phone,
      province,
      city,
      address,
      landmark,
      label,
      title: label,
      location: city,
    });
  }
  return { addresses };
}

module.exports = { PROVINCES, DELIVERY_CITIES, ADDRESS_LABELS, validateAddressList };
