import { useCallback, useEffect, useRef, useState } from 'react';
import api from '../../utils/api';
import { visitorHeaders } from '../../utils/activityTracking';
import { readPublicCache, writePublicCache } from '../../utils/publicCache';
import { getSessionToken } from '../../utils/sessionAuth';

const FOCUS_REFRESH_MS = 60 * 1000;

/** Loads /api/home/feed and keeps it fresh after orders, reviews and wishlist changes. */
export default function useHomeFeed({ user, area = '', coords = null }) {
  const [feed, setFeed] = useState(null);
  const [status, setStatus] = useState('loading');
  const requestRef = useRef(0);
  const loadedAtRef = useRef(0);

  const userId = user?._id || user?.id || '';
  const savedCount = Array.isArray(user?.wishlist?.businesses) ? user.wishlist.businesses.length : 0;
  const lat = coords?.lat;
  const lng = coords?.lng;

  const load = useCallback(async () => {
    const requestId = ++requestRef.current;
    const params = {};
    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      params.lat = lat;
      params.lng = lng;
    } else if (area) {
      params.area = area;
    }
    // Signed-in feeds include personal activity, so only guest feeds are kept on the device.
    const cacheKey = getSessionToken()
      ? ''
      : `home-feed:${params.lat !== undefined ? `${lat.toFixed(2)},${lng.toFixed(2)}` : area}`;
    const cached = cacheKey ? readPublicCache(cacheKey) : null;
    if (cached) {
      setFeed(cached);
      setStatus('ready');
    } else {
      setStatus((prev) => (prev === 'ready' ? 'ready' : 'loading'));
    }
    try {
      const { data } = await api.get('/api/home/feed', { params, headers: visitorHeaders() });
      if (requestId !== requestRef.current) return;
      setFeed(data);
      setStatus('ready');
      loadedAtRef.current = Date.now();
      if (cacheKey && !getSessionToken()) writePublicCache(cacheKey, data);
    } catch {
      if (requestId !== requestRef.current) return;
      setStatus((prev) => (prev === 'ready' ? 'ready' : 'error'));
    }
  }, [area, lat, lng]);

  useEffect(() => {
    load();
  }, [load, userId, savedCount]);

  useEffect(() => {
    const refresh = () => load();
    const onFocus = () => {
      if (Date.now() - loadedAtRef.current > FOCUS_REFRESH_MS) load();
    };
    window.addEventListener('orders-updated', refresh);
    window.addEventListener('review-created', refresh);
    window.addEventListener('focus', onFocus);
    return () => {
      window.removeEventListener('orders-updated', refresh);
      window.removeEventListener('review-created', refresh);
      window.removeEventListener('focus', onFocus);
    };
  }, [load]);

  useEffect(() => () => {
    requestRef.current += 1;
  }, []);

  return { feed, status, reload: load };
}
