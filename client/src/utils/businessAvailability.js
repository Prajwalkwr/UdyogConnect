function parseHours(hours = '') {
  if (typeof hours !== 'string') return null;
  const match = hours.match(/(\d{1,2})(?::(\d{2}))?\s*[-–to]+\s*(\d{1,2})(?::(\d{2}))?/i);
  if (!match) return null;

  const [, startHour, startMin = '0', endHour, endMin = '0'] = match;
  const start = Number(startHour) * 60 + Number(startMin);
  const end = Number(endHour) * 60 + Number(endMin);
  return { start, end };
}

export function getBusinessAvailabilityMeta(business = {}, now = new Date()) {
  const deliveryAvailable = business.deliveryAvailable !== undefined ? Boolean(business.deliveryAvailable) : true;
  const deliveryRadiusKm = Number(business.deliveryRadiusKm || business.radius || 5);
  const radius = Number.isFinite(deliveryRadiusKm) ? deliveryRadiusKm : 5;

  const hours = parseHours(business.hours);
  const isOpenByHours = hours ? (() => {
    const currentMinutes = now.getHours() * 60 + now.getMinutes();
    if (hours.start <= hours.end) {
      return currentMinutes >= hours.start && currentMinutes <= hours.end;
    }
    return currentMinutes >= hours.start || currentMinutes <= hours.end;
  })() : true;

  const isOpen = business.isOpen !== undefined ? Boolean(business.isOpen) : isOpenByHours;
  const effectiveIsOpen = business.isOpen === undefined ? isOpenByHours : isOpen;

  return {
    isOpen: effectiveIsOpen,
    deliveryAvailable,
    deliveryRadiusKm: radius,
    openLabel: effectiveIsOpen ? 'Open' : 'Closed',
    deliveryLabel: deliveryAvailable ? `Delivery up to ${radius} km` : 'Delivery not available',
  };
}
