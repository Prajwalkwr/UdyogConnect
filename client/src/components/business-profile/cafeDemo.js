import { isManualOverrideActive } from '../../utils/businessAvailability';

export function formatRs(value, { plus = false } = {}) {
  const amount = Number(value || 0).toLocaleString('en-NP');
  return `NPR ${amount}${plus ? '+' : ''}`;
}

export function timeAgo(iso) {
  if (!iso) return 'Recently';
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  if (days <= 0) return 'Today';
  if (days === 1) return '1 day ago';
  if (days < 30) return `${days} days ago`;
  return new Date(iso).toLocaleDateString();
}

export function mapsDirectionsUrl(lat, lng) {
  return `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=driving`;
}

export function mapsEmbedUrl(lat, lng) {
  const d = 0.008;
  return `https://www.openstreetmap.org/export/embed.html?bbox=${lng - d}%2C${lat - d}%2C${lng + d}%2C${lat + d}&layer=mapnik&marker=${lat}%2C${lng}`;
}

export function computeDistribution(reviews = []) {
  if (!reviews.length) return { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
  const counts = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
  reviews.forEach((review) => {
    counts[Math.min(5, Math.max(1, Math.round(Number(review.rating) || 0)))] += 1;
  });
  const total = reviews.length;
  return {
    5: Math.round((counts[5] / total) * 100),
    4: Math.round((counts[4] / total) * 100),
    3: Math.round((counts[3] / total) * 100),
    2: Math.round((counts[2] / total) * 100),
    1: Math.round((counts[1] / total) * 100),
  };
}

function parseHourRange(hours = '') {
  if (typeof hours !== 'string') return null;
  const match = hours.match(/(\d{1,2})(?::(\d{2}))?\s*[-–to]+\s*(\d{1,2})(?::(\d{2}))?/i);
  if (!match) return null;
  const start = Number(match[1]) * 60 + Number(match[2] || 0);
  const end = Number(match[3]) * 60 + Number(match[4] || 0);
  return { start, end };
}

export function isOpenNow(business, now = new Date()) {
  // Lazy import pattern avoided — keep local mirror of day/hours check for profile UI.
  const dayKeys = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
  const todayKey = dayKeys[now.getDay()];
  const openingDays = Array.isArray(business?.openingDays) && business.openingDays.length
    ? business.openingDays.map((d) => String(d).toLowerCase().slice(0, 3))
    : ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
  const openToday = openingDays.includes(todayKey);

  if (business && isManualOverrideActive(business, now)) {
    const forced = Boolean(business.manualOpenOverride);
    return {
      open: forced,
      label: forced ? 'Open Now' : 'Closed',
      until: forced
        ? (business.hours || `${business.opensAt || '7:00 AM'} - ${business.closesAt || '10:00 PM'}`)
        : (openToday ? `Hours ${business.hours || ''}`.trim() : 'Closed today'),
    };
  }

  if (!openToday) {
    return { open: false, label: 'Closed Today', until: 'Not open on this day' };
  }

  const opensAt = business?.opensAt || '7:00 AM';
  const closesAt = business?.closesAt || '10:00 PM';
  const range = parseHourRange(business?.hours) || { start: 7 * 60, end: 22 * 60 };
  const minutes = now.getHours() * 60 + now.getMinutes();
  const open = range.start <= range.end
    ? minutes >= range.start && minutes < range.end
    : minutes >= range.start || minutes < range.end;
  if (open) {
    return { open: true, label: 'Open Now', until: business.hours || `${opensAt} - ${closesAt}` };
  }
  return { open: false, label: 'Closed', until: `Opens at ${business.hours?.split('-')?.[0]?.trim() || opensAt}` };
}

export function emptyProfile(id = '') {
  return {
    business: {
      _id: id,
      name: '',
      category: '',
      subcategory: '',
      location: '',
      distanceLabel: '',
      description: '',
      phone: '',
      contactEmail: '',
      website: '',
      verified: false,
      rating: 0,
      reviewCount: 0,
      latitude: null,
      longitude: null,
      imageUrl: '',
      coverUrl: '',
      openingHours: [],
      closesAt: '',
      opensAt: '',
      hours: '',
      tags: [],
      highlights: [],
      whyChooseUs: [],
      paymentMethods: [],
      specialOffer: null,
    },
    products: [],
    services: [],
    reviews: [],
    distribution: computeDistribution([]),
    reviewFilters: [{ id: 'all', label: 'All', count: 0 }],
  };
}

export function normalizeProfile(id, payload) {
  if (!payload?.business) return null;

  const business = payload.business;
  const products = Array.isArray(payload.products) ? payload.products : [];
  const services = Array.isArray(payload.services) ? payload.services : [];
  const reviews = Array.isArray(payload.reviews) ? payload.reviews : [];
  const ratingAvg = reviews.length
    ? reviews.reduce((sum, review) => sum + Number(review.rating || 0), 0) / reviews.length
    : Number(business.rating || 0);

  return {
    business: {
      ...business,
      _id: business._id || id,
      name: business.name || 'Business',
      category: business.category || 'Local Business',
      subcategory: business.subcategory || business.businessType || '',
      location: business.location || '',
      distanceLabel: business.distanceLabel || '',
      description: business.description || '',
      phone: business.phone || '',
      contactEmail: business.contactEmail || business.email || '',
      website: business.website || '',
      verified: Boolean(business.verified === true || business.verified === 'verified' || business.verified === 'approved' || business.isVerified === true),
      rating: Number((ratingAvg || 0).toFixed(1)),
      reviewCount: reviews.length || Number(business.reviewCount || 0),
      latitude: Number(business.latitude) || null,
      longitude: Number(business.longitude) || null,
      imageUrl: business.imageUrl || business.logoUrl || '',
      coverUrl: business.coverUrl || '',
      openingHours: Array.isArray(business.openingHours) && business.openingHours.length
        ? business.openingHours
        : (() => {
            const dayOrder = [
              { key: 'mon', label: 'Monday' },
              { key: 'tue', label: 'Tuesday' },
              { key: 'wed', label: 'Wednesday' },
              { key: 'thu', label: 'Thursday' },
              { key: 'fri', label: 'Friday' },
              { key: 'sat', label: 'Saturday' },
              { key: 'sun', label: 'Sunday' },
            ];
            const openDays = Array.isArray(business.openingDays) && business.openingDays.length
              ? business.openingDays.map((d) => String(d).toLowerCase().slice(0, 3))
              : dayOrder.map((d) => d.key);
            const hoursValue = business.hours || '9:00 AM – 6:00 PM';
            return dayOrder.map((day) => {
              const open = openDays.includes(day.key);
              return {
                label: day.label,
                value: open ? hoursValue : 'Closed',
                closed: !open,
              };
            });
          })(),
      closesAt: business.closesAt || '',
      opensAt: business.opensAt || '',
      hours: business.hours || '',
      openingDays: Array.isArray(business.openingDays) ? business.openingDays : [],
      tags: Array.isArray(business.tags) ? business.tags : [],
      highlights: Array.isArray(business.highlights) ? business.highlights : [
        { id: 'local', label: 'Local Business', icon: 'store' },
      ],
      // Only claims the business itself entered; nothing is filled in on its behalf.
      whyChooseUs: Array.isArray(business.whyChooseUs) ? business.whyChooseUs : [],
      paymentMethods: Array.isArray(business.paymentMethods) ? business.paymentMethods : [
        'Cash on Delivery',
        ...(business.esewaEnabled ? ['eSewa'] : []),
        ...(business.qrUrl ? ['QR Payment'] : []),
      ],
      specialOffer: business.specialOffer || null,
    },
    products: products.map((product, index) => ({
      _id: product._id || `p-${index}`,
      name: product.name,
      description: product.description || '',
      price: Number(product.price || 0),
      rating: Number(product.rating || 0),
      imageUrl: product.imageUrl || product.image || product.images?.[0] || '',
      badge: product.badge || '',
      stock: product.stock ?? 20,
      category: product.category || business.category || 'Product',
      businessId: business._id,
    })),
    services: services.map((service, index) => ({
      _id: service._id || `s-${index}`,
      name: service.name,
      description: service.description || '',
      price: Number(service.price || 0),
      priceLabel: service.priceLabel || null,
      duration: service.duration || service.timeSlot || '1 Hour',
      imageUrl: service.imageUrl || service.image || service.images?.[0] || '',
      icon: service.icon || 'table',
    })),
    reviews: reviews.map((review, index) => ({
      _id: review._id || `r-${index}`,
      customerId: review.customerId ? String(review.customerId) : '',
      userName: review.userName || review.customerName || review.user?.name || review.name || 'Customer',
      rating: Number(review.rating || 0),
      category: review.category || 'Food',
      comment: review.comment || review.text || '',
      createdAt: review.createdAt || new Date().toISOString(),
      imageUrl: review.imageUrl || review.image || '',
      photos: Array.isArray(review.photos) ? review.photos : (review.imageUrl ? [review.imageUrl] : []),
    })),
    distribution: computeDistribution(reviews),
    reviewFilters: [
      { id: 'all', label: 'All', count: reviews.length },
      { id: 'Food', label: 'Food', count: reviews.filter((r) => (r.category || 'Food') === 'Food').length },
      { id: 'Service', label: 'Service', count: reviews.filter((r) => r.category === 'Service').length },
      { id: 'Ambience', label: 'Ambience', count: reviews.filter((r) => r.category === 'Ambience').length },
    ],
  };
}
