export const CAFE_XYZ_ID = 'cafe-xyz';

export const IMG_COVER =
  'https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?auto=format&fit=crop&w=1600&q=80';
export const IMG_COFFEE =
  'https://images.unsplash.com/photo-1509042239860-f550ce710b93?auto=format&fit=crop&w=800&q=80';
export const IMG_BURGER =
  'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?auto=format&fit=crop&w=800&q=80';
export const IMG_MOMOS =
  'https://images.unsplash.com/photo-1534422298391-e4f8c172dddb?auto=format&fit=crop&w=800&q=80';
export const IMG_CATERING =
  'https://images.unsplash.com/photo-1511920170033-f8396924c348?auto=format&fit=crop&w=800&q=80';

export const THAMEL = { lat: 27.7152, lng: 85.3126 };

export const cafeDemo = {
  business: {
    _id: CAFE_XYZ_ID,
    name: 'Cafe XYZ',
    category: 'Restaurants & Food',
    location: 'Thamel, Kathmandu',
    description:
      'Cafe XYZ is a cozy neighborhood cafe in the heart of Thamel. We serve specialty coffee, fresh bakery, and hearty meals made with locally sourced ingredients.',
    phone: '9812345678',
    contactEmail: 'cafexyz@gmail.com',
    website: 'https://www.cafexyz.com',
    verified: true,
    rating: 4.8,
    reviewCount: 126,
    latitude: THAMEL.lat,
    longitude: THAMEL.lng,
    imageUrl: IMG_COFFEE,
    coverUrl: IMG_COVER,
    hours: '10:00-20:00',
    openingHours: [
      { label: 'Monday – Friday', value: '10:00 AM – 8:00 PM', closed: false },
      { label: 'Saturday', value: '11:00 AM – 9:00 PM', closed: false },
      { label: 'Sunday', value: 'Closed', closed: true },
    ],
    closesAt: '8:00 PM',
  },
  products: [
    {
      _id: 'cafe-xyz-coffee',
      name: 'Hot Coffee',
      description: 'Freshly brewed coffee with rich aroma',
      price: 150,
      rating: 4.7,
      imageUrl: IMG_COFFEE,
      badge: 'Best Seller',
      stock: 40,
      category: 'Drinks',
    },
    {
      _id: 'cafe-xyz-burger',
      name: 'Chicken Burger',
      description: 'Juicy chicken patty with fresh veggies',
      price: 250,
      rating: 4.6,
      imageUrl: IMG_BURGER,
      stock: 25,
      category: 'Food',
    },
    {
      _id: 'cafe-xyz-momos',
      name: 'Veg Momos',
      description: 'Steamed momos with spicy sauce',
      price: 120,
      rating: 4.5,
      imageUrl: IMG_MOMOS,
      stock: 30,
      category: 'Food',
    },
  ],
  services: [
    {
      _id: 'cafe-xyz-catering',
      name: 'Coffee Catering Service',
      description: 'We provide special coffee catering for events and occasions.',
      price: 1500,
      duration: '1 Hour',
      imageUrl: IMG_CATERING,
    },
  ],
  reviews: [
    {
      _id: 'rev-sita',
      userName: 'Sita Thapa',
      rating: 5,
      comment: 'Great coffee and friendly service! Loved the place.',
      createdAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
      imageUrl: IMG_COFFEE,
    },
    {
      _id: 'rev-ram',
      userName: 'Ram Shrestha',
      rating: 5,
      comment: 'Best momos in Thamel. The cafe is cozy and perfect for work.',
      createdAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
      imageUrl: IMG_MOMOS,
    },
    {
      _id: 'rev-anjali',
      userName: 'Anjali KC',
      rating: 4,
      comment: 'Loved the burger. A bit crowded on weekends but worth the wait.',
      createdAt: new Date(Date.now() - 9 * 24 * 60 * 60 * 1000).toISOString(),
      imageUrl: IMG_BURGER,
    },
  ],
  distribution: { 5: 78, 4: 14, 3: 5, 2: 2, 1: 1 },
};

export function formatRs(value) {
  return `Rs. ${Number(value || 0).toLocaleString('en-NP')}`;
}

export function timeAgo(iso) {
  if (!iso) return 'Recently';
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  if (days <= 0) return 'Today';
  if (days === 1) return '1 day ago';
  if (days < 30) return `${days} days ago`;
  return new Date(iso).toLocaleDateString();
}

export function mapsDirectionsUrl(lat, lng, label) {
  return `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=driving`;
}

export function mapsEmbedUrl(lat, lng) {
  const d = 0.008;
  return `https://www.openstreetmap.org/export/embed.html?bbox=${lng - d}%2C${lat - d}%2C${lng + d}%2C${lat + d}&layer=mapnik&marker=${lat}%2C${lng}`;
}

export function computeDistribution(reviews = [], fallback) {
  if (!reviews.length) return fallback || { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
  const counts = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
  reviews.forEach((review) => {
    counts[Math.min(5, Math.max(1, Math.round(Number(review.rating) || 5)))] += 1;
  });
  const total = reviews.length || 1;
  return {
    5: Math.round((counts[5] / total) * 100),
    4: Math.round((counts[4] / total) * 100),
    3: Math.round((counts[3] / total) * 100),
    2: Math.round((counts[2] / total) * 100),
    1: Math.round((counts[1] / total) * 100),
  };
}

export function isOpenNow(now = new Date()) {
  const day = now.getDay();
  const minutes = now.getHours() * 60 + now.getMinutes();
  if (day === 0) return { open: false, label: 'Closed', until: 'Closed on Sunday' };
  const saturday = day === 6;
  const start = saturday ? 11 * 60 : 10 * 60;
  const end = saturday ? 21 * 60 : 20 * 60;
  if (minutes >= start && minutes < end) {
    return { open: true, label: 'Open Now', until: `Closes at ${saturday ? '9:00 PM' : '8:00 PM'}` };
  }
  return { open: false, label: 'Closed', until: 'Opens at 10:00 AM' };
}

export function normalizeProfile(id, payload) {
  if (!payload?.business || id === CAFE_XYZ_ID) {
    return { ...cafeDemo, fromDemo: true };
  }

  const business = payload.business;
  const products = Array.isArray(payload.products) ? payload.products : [];
  const services = Array.isArray(payload.services) ? payload.services : [];
  const reviews = Array.isArray(payload.reviews) ? payload.reviews : [];
  const ratingAvg = reviews.length
    ? reviews.reduce((sum, review) => sum + Number(review.rating || 0), 0) / reviews.length
    : Number(business.rating || cafeDemo.business.rating);

  return {
    fromDemo: false,
    business: {
      ...cafeDemo.business,
      ...business,
      _id: business._id || id,
      name: business.name || cafeDemo.business.name,
      category: business.category || cafeDemo.business.category,
      location: business.location || cafeDemo.business.location,
      description: business.description || cafeDemo.business.description,
      phone: business.phone || cafeDemo.business.phone,
      contactEmail: business.contactEmail || business.email || cafeDemo.business.contactEmail,
      website: business.website || cafeDemo.business.website,
      verified: Boolean(business.verified === true || business.verified === 'verified' || business.verified === 'approved'),
      rating: Number(ratingAvg.toFixed(1)) || cafeDemo.business.rating,
      reviewCount: reviews.length || Number(business.reviewCount || cafeDemo.business.reviewCount),
      latitude: Number(business.latitude) || THAMEL.lat,
      longitude: Number(business.longitude) || THAMEL.lng,
      imageUrl: business.imageUrl || business.logoUrl || cafeDemo.business.imageUrl,
      coverUrl: business.coverUrl || business.imageUrl || cafeDemo.business.coverUrl,
      openingHours: cafeDemo.business.openingHours,
      closesAt: cafeDemo.business.closesAt,
    },
    products: (products.length ? products : cafeDemo.products).map((product, index) => ({
      _id: product._id || `p-${index}`,
      name: product.name,
      description: product.description || '',
      price: Number(product.price || 0),
      rating: Number(product.rating || 4.5),
      imageUrl: product.imageUrl || product.image || IMG_COFFEE,
      badge: index === 0 ? 'Best Seller' : product.badge,
      stock: product.stock ?? 20,
      category: product.category || business.category || 'Product',
      businessId: business._id,
    })),
    services: (services.length ? services : cafeDemo.services).map((service, index) => ({
      _id: service._id || `s-${index}`,
      name: service.name,
      description: service.description || '',
      price: Number(service.price || 0),
      duration: service.duration || service.timeSlot || '1 Hour',
      imageUrl: service.imageUrl || service.image || IMG_CATERING,
    })),
    reviews: (reviews.length ? reviews : cafeDemo.reviews).map((review, index) => ({
      _id: review._id || `r-${index}`,
      userName: review.userName || review.user?.name || review.name || 'Customer',
      rating: Number(review.rating || 5),
      comment: review.comment || review.text || '',
      createdAt: review.createdAt || new Date().toISOString(),
      imageUrl: review.imageUrl || review.image || business.imageUrl,
    })),
    distribution: computeDistribution(reviews.length ? reviews : cafeDemo.reviews, cafeDemo.distribution),
  };
}
