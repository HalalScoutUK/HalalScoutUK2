'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';
import Map, { Marker, Popup, Source, Layer } from 'react-map-gl/mapbox';
import 'mapbox-gl/dist/mapbox-gl.css';
import { createClient } from '@/lib/supabase/client';
import {
  ShieldCheck,
  AlertTriangle,
  MapPin,
  Phone,
  Globe,
  Award,
  Image as ImageIcon,
  UserCheck,
  Store,
  Navigation,
  Search,
  Crosshair,
  ChevronRight,
  X,
  Star,
  Heart,
  LogOut,
  LogIn,
  KeyRound,
  User,
  Bookmark,
  MessageSquare,
  Compass,
  Trophy,
} from 'lucide-react';

/* ------------------------------------------------------------------ */
/* Helpers                                                            */
/* ------------------------------------------------------------------ */

type MediaKey = 'SHOP_FRONT' | 'INTERIOR' | 'FOOD' | 'MENU';

const MEDIA_TABS: { key: MediaKey; label: string }[] = [
  { key: 'FOOD', label: 'Food' },
  { key: 'SHOP_FRONT', label: 'Shop front' },
  { key: 'INTERIOR', label: 'Interior' },
  { key: 'MENU', label: 'Menu' },
];

const LONDON = { latitude: 51.5074, longitude: -0.1278 };

// Columns fetched for every visitor. Deliberately excludes owner_claim_code
// so claim codes are never sent to the browser. Adjust to match your table.
const RESTAURANT_COLUMNS = [
  'id',
  'name',
  'lat',
  'lng',
  'city',
  'postcode',
  'phone',
  'website',
  'halal_category',
  'serves_alcohol',
  'certificate_issuer',
  'certificate_number',
  'certificate_link',
  'media',
  'reviews',
].join(',');

function calculateDistanceMiles(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
) {
  const R = 3958.8;
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * (Math.PI / 180)) *
      Math.cos(lat2 * (Math.PI / 180)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function zoomForRadius(miles: number) {
  if (miles <= 0.5) return 14.2;
  if (miles <= 1) return 13.0;
  return 10.8;
}

function getUserTier(points: number) {
  if (points >= 1000) {
    return {
      title: 'Trusted Scout',
      badge: '⭐ Trusted Scout',
      color: 'bg-amber-400/20 text-amber-300 border-amber-400/40',
    };
  } else if (points >= 500) {
    return {
      title: 'Gold Scout',
      badge: '🥇 Gold Scout',
      color: 'bg-amber-400/20 text-amber-300 border-amber-400/40',
    };
  } else if (points >= 200) {
    return {
      title: 'Silver Scout',
      badge: '🥈 Silver Scout',
      color: 'bg-slate-300/20 text-slate-200 border-slate-400/40',
    };
  }
  return {
    title: 'Novice Scout',
    badge: '🥉 Novice Scout',
    color: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40',
  };
}

function getAverageRating(reviews: any[]) {
  if (!reviews || reviews.length === 0) return null;
  const sum = reviews.reduce((acc, r) => acc + (r.rating || 5), 0);
  return (sum / reviews.length).toFixed(1);
}

function createGeoJSONCircle(
  center: [number, number],
  radiusInMiles: number,
  points = 64
) {
  const km = radiusInMiles * 1.60934;
  const coords: number[][] = [];
  const distanceX = km / (111.32 * Math.cos((center[1] * Math.PI) / 180));
  const distanceY = km / 110.574;

  for (let i = 0; i < points; i++) {
    const theta = (i / points) * (2 * Math.PI);
    coords.push([
      center[0] + distanceX * Math.cos(theta),
      center[1] + distanceY * Math.sin(theta),
    ]);
  }
  coords.push(coords[0]);

  return {
    type: 'Feature' as const,
    geometry: {
      type: 'Polygon' as const,
      coordinates: [coords],
    },
    properties: {},
  };
}

function getCategoryBadge(cat: string) {
  switch (cat) {
    case 'HMC_CERTIFIED':
      return { label: 'HMC Certified', color: 'bg-emerald-600 text-white' };
    case 'HALAL_CERTIFIED':
      return { label: 'Halal Certified', color: 'bg-teal-600 text-white' };
    case 'HALAL_OPTIONS':
      return { label: 'Halal Options', color: 'bg-sky-600 text-white' };
    default:
      return { label: cat, color: 'bg-gray-600 text-white' };
  }
}

/* ------------------------------------------------------------------ */
/* Component                                                          */
/* ------------------------------------------------------------------ */

export default function UKHalalAppMapbox() {
  const [supabase] = useState(() => createClient());

  const [role, setRole] = useState<'USER' | 'OWNER'>('USER');
  const [selectedFilter, setSelectedFilter] = useState<string>('ALL');
  const [maxDistanceMiles, setMaxDistanceMiles] = useState<number>(0.5);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const skipSuggestRef = useRef(false);

  const [userLocation, setUserLocation] = useState(LONDON);
  const [viewState, setViewState] = useState({
    ...LONDON,
    zoom: 14.2,
  });
  const [locationStatus, setLocationStatus] = useState('Detecting GPS...');

  const [restaurants, setRestaurants] = useState<any[]>([]);
  const [activeRestaurantId, setActiveRestaurantId] = useState<number | null>(
    null
  );
  const [mediaTab, setMediaTab] = useState<MediaKey>('FOOD');

  // Auth, favourites, profile & ownership
  const [user, setUser] = useState<any>(null);
  const [username, setUsername] = useState<string | null>(null);
  const [myPoints, setMyPoints] = useState(0);
  const [favorites, setFavorites] = useState<number[]>([]);
  const [ownedRestaurantIds, setOwnedRestaurantIds] = useState<number[]>([]);

  const [showAuthModal, setShowAuthModal] = useState(false);
  const [showUsernameModal, setShowUsernameModal] = useState(false);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [showClaimModal, setShowClaimModal] = useState(false);
  const [showCertModal, setShowCertModal] = useState(false);
  const [showOwnerModal, setShowOwnerModal] = useState(false);

  const [desiredUsername, setDesiredUsername] = useState('');
  const [usernameError, setUsernameError] = useState('');
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authMode, setAuthMode] = useState<'SIGNIN' | 'SIGNUP'>('SIGNIN');
  const [authError, setAuthError] = useState('');
  const [claimCodeInput, setClaimCodeInput] = useState('');
  const [claimError, setClaimError] = useState('');
  const [claiming, setClaiming] = useState(false);
  const [saving, setSaving] = useState(false);

  const [notice, setNotice] = useState('');

  const isVerifiedOwner = ownedRestaurantIds.length > 0;

  const [editForm, setEditForm] = useState({
    shopFront: '',
    interior: '',
    food: '',
    menu: '',
    certificateLink: '',
  });

  /* ------------------------- Notices ------------------------- */

  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(''), 4000);
    return () => clearTimeout(t);
  }, [notice]);

  /* ------------------------- Auth ------------------------- */

  async function fetchFavorites(userId: string) {
    const { data, error } = await supabase
      .from('favorites')
      .select('restaurant_id')
      .eq('user_id', userId);
    if (!error && data) {
      setFavorites(data.map((f: any) => f.restaurant_id));
    }
  }

  async function checkUserProfile(userId: string) {
    const { data } = await supabase
      .from('profiles')
      .select('username, points')
      .eq('id', userId)
      .maybeSingle();

    if (!data?.username) {
      setShowUsernameModal(true);
    } else {
      setUsername(data.username);
      if (data.points != null) setMyPoints(data.points);
    }

    const { data: ownerships, error: ownerError } = await supabase
      .from('restaurant_owners')
      .select('restaurant_id')
      .eq('user_id', userId);

    if (!ownerError && ownerships) {
      setOwnedRestaurantIds(ownerships.map((o: any) => o.restaurant_id));
    }
  }

  // onAuthStateChange fires INITIAL_SESSION on subscribe, so a separate
  // getSession() call isn't needed. Don't await Supabase calls inside the
  // callback itself.
  useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      const u = session?.user ?? null;
      setUser(u);
      if (u) {
        fetchFavorites(u.id);
        checkUserProfile(u.id);
      } else {
        setFavorites([]);
        setUsername(null);
        setOwnedRestaurantIds([]);
        setRole('USER');
        setMyPoints(0);
        setSelectedFilter((f) => (f === 'FAVOURITES' ? 'ALL' : f));
      }
    });

    return () => subscription.unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleSaveUsername(e: React.FormEvent) {
    e.preventDefault();
    setUsernameError('');
    const trimmed = desiredUsername.trim();
    if (trimmed.length < 3) {
      setUsernameError('Username must be at least 3 characters long.');
      return;
    }
    if (!/^[a-zA-Z0-9_]+$/.test(trimmed)) {
      setUsernameError('Use letters, numbers and underscores only.');
      return;
    }

    // points is left out so an existing row's points are never reset
    const { error } = await supabase.from('profiles').upsert({
      id: user.id,
      username: trimmed,
      updated_at: new Date().toISOString(),
    });

    if (error) {
      setUsernameError(
        error.code === '23505'
          ? 'This username is already taken. Please choose another.'
          : error.message
      );
    } else {
      setUsername(trimmed);
      setShowUsernameModal(false);
      setDesiredUsername('');
    }
  }

  const handleAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError('');
    if (authMode === 'SIGNIN') {
      const { error } = await supabase.auth.signInWithPassword({
        email: authEmail,
        password: authPassword,
      });
      if (error) setAuthError(error.message);
      else {
        setShowAuthModal(false);
        setAuthPassword('');
      }
    } else {
      const { error } = await supabase.auth.signUp({
        email: authEmail,
        password: authPassword,
      });
      if (error) setAuthError(error.message);
      else {
        setNotice('Check your email for a confirmation link, then sign in.');
        setAuthMode('SIGNIN');
        setAuthPassword('');
      }
    }
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
  };

  /* ------------------------- Favourites ------------------------- */

  const toggleFavorite = async (restaurantId: number, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!user) {
      setAuthMode('SIGNIN');
      setShowAuthModal(true);
      return;
    }

    const isFav = favorites.includes(restaurantId);
    if (isFav) {
      const { error } = await supabase
        .from('favorites')
        .delete()
        .eq('user_id', user.id)
        .eq('restaurant_id', restaurantId);
      if (!error)
        setFavorites((prev) => prev.filter((id) => id !== restaurantId));
    } else {
      const { error } = await supabase
        .from('favorites')
        .insert({ user_id: user.id, restaurant_id: restaurantId });
      if (!error) setFavorites((prev) => [...prev, restaurantId]);
    }
  };

  /* ------------------------- Restaurants ------------------------- */

  useEffect(() => {
    async function fetchRestaurants() {
      const { data, error } = await supabase
        .from('restaurants')
        .select(RESTAURANT_COLUMNS);
      if (error) {
        console.error('Error fetching restaurants:', error.message);
        setNotice('Could not load restaurants. Please refresh.');
        return;
      }
      if (data && data.length > 0) {
        const formatted = (data as any[])
          .filter(
            (r) =>
              r.name && r.name.trim() !== '' && r.lat != null && r.lng != null
          )
          .map((r) => ({
            ...r,
            halalCategory: r.halal_category || 'HMC_CERTIFIED',
            servesAlcohol: r.serves_alcohol ?? false,
            certificateIssuer:
              r.certificate_issuer || 'HMC (Halal Monitoring Committee UK)',
            certificateNumber: r.certificate_number || null,
            certificateLink: r.certificate_link || '',
            media: r.media || {},
            reviews: r.reviews || [],
          }));
        setRestaurants(formatted);
      }
    }

    fetchRestaurants();
    handleResetToCurrentLocation();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Only react to radius changes. Previously this also ran on every
  // userLocation change, which overrode any zoom the user had set.
  useEffect(() => {
    setViewState((prev) => ({ ...prev, zoom: zoomForRadius(maxDistanceMiles) }));
  }, [maxDistanceMiles]);

  const activeRestaurant =
    restaurants.find((r) => r.id === activeRestaurantId) || null;

  const ownedRestaurant =
    restaurants.find((r) => ownedRestaurantIds.includes(r.id)) || null;

  // Prefill the owner edit form from the owner's own restaurant
  useEffect(() => {
    if (ownedRestaurant) {
      setEditForm({
        shopFront: ownedRestaurant.media?.SHOP_FRONT || '',
        interior: ownedRestaurant.media?.INTERIOR || '',
        food: ownedRestaurant.media?.FOOD || '',
        menu: ownedRestaurant.media?.MENU || '',
        certificateLink: ownedRestaurant.certificateLink || '',
      });
    }
  }, [ownedRestaurant?.id, showOwnerModal]);

  /* ------------------------- Location & search ------------------------- */

  function handleResetToCurrentLocation() {
    if (!('geolocation' in navigator)) {
      setLocationStatus('GPS unavailable. Showing London center.');
      return;
    }
    setLocationStatus('Detecting GPS...');
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        setUserLocation({ latitude, longitude });
        setViewState((prev) => ({
          ...prev,
          latitude,
          longitude,
          zoom: zoomForRadius(maxDistanceMiles),
        }));
        setLocationStatus('Using your live GPS location');
        setSearchQuery('');
        setSuggestions([]);
      },
      () => {
        setLocationStatus('GPS unavailable. Showing London center.');
      },
      { timeout: 7000 }
    );
  }

  // Debounced, cancellable autocomplete
  useEffect(() => {
    if (skipSuggestRef.current) {
      skipSuggestRef.current = false;
      return;
    }
    const q = searchQuery.trim();
    if (q.length < 2) {
      setSuggestions([]);
      return;
    }

    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const [postcodeRes, nominatimRes] = await Promise.all([
          fetch(
            `https://api.postcodes.io/postcodes/${encodeURIComponent(
              q
            )}/autocomplete`,
            { signal: controller.signal }
          ).catch(() => null),
          fetch(
            `https://nominatim.openstreetmap.org/search?format=json&countrycodes=gb&limit=4&q=${encodeURIComponent(
              q
            )}`,
            { signal: controller.signal }
          ).catch(() => null),
        ]);

        let next: string[] = [];
        if (postcodeRes?.ok) {
          const pc = await postcodeRes.json();
          if (pc.status === 200 && Array.isArray(pc.result))
            next = [...next, ...pc.result];
        }
        if (nominatimRes?.ok) {
          const nom = await nominatimRes.json();
          if (Array.isArray(nom)) {
            next = [
              ...next,
              ...nom.map((item: any) => item.display_name.split(',')[0]),
            ];
          }
        }
        if (!controller.signal.aborted) {
          setSuggestions(Array.from(new Set(next)).slice(0, 5));
        }
      } catch {
        /* aborted or network error: ignore */
      }
    }, 300);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [searchQuery]);

  const moveTo = (latitude: number, longitude: number, zoom = 13) => {
    setUserLocation({ latitude, longitude });
    setViewState((prev) => ({ ...prev, latitude, longitude, zoom }));
  };

  const executeSearch = async (queryTerm: string) => {
    const query = queryTerm.trim();
    if (!query) return;
    setLocationStatus(`Searching area: ${query}...`);
    setSuggestions([]);

    try {
      const postcodeRes = await fetch(
        `https://api.postcodes.io/postcodes/${encodeURIComponent(query)}`
      );
      const postcodeData = await postcodeRes.json();
      if (postcodeData.status === 200 && postcodeData.result) {
        const { latitude, longitude, postcode, admin_district } =
          postcodeData.result;
        moveTo(latitude, longitude);
        setLocationStatus(`Postcode: ${postcode} (${admin_district || 'UK'})`);
        return;
      }

      const nominatimRes = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&countrycodes=gb&q=${encodeURIComponent(
          query
        )}`
      );
      const nominatimData = await nominatimRes.json();
      if (nominatimData && nominatimData.length > 0) {
        const { lat, lon, display_name } = nominatimData[0];
        moveTo(parseFloat(lat), parseFloat(lon));
        setLocationStatus(`Area: ${display_name.split(',')[0]}`);
        return;
      }

      const q = query.toLowerCase();
      const found = restaurants.find(
        (r) =>
          r.city?.toLowerCase().includes(q) ||
          r.postcode?.toLowerCase().includes(q)
      );
      if (found) {
        moveTo(found.lat, found.lng, 14);
        setActiveRestaurantId(found.id);
        setLocationStatus(`Found: ${found.city}`);
      } else {
        setLocationStatus('Location not found.');
      }
    } catch {
      setLocationStatus('Search failed.');
    }
  };

  /* ------------------------- Derived data ------------------------- */

  const filteredRestaurants = useMemo(() => {
    return restaurants
      .map((rest) => ({
        ...rest,
        distance: parseFloat(
          calculateDistanceMiles(
            userLocation.latitude,
            userLocation.longitude,
            rest.lat,
            rest.lng
          ).toFixed(1)
        ),
      }))
      .sort((a, b) => a.distance - b.distance)
      .filter((rest) => {
        const inRange =
          maxDistanceMiles === 0 || rest.distance <= maxDistanceMiles;
        if (selectedFilter === 'FAVOURITES') {
          return !!user && favorites.includes(rest.id) && inRange;
        }
        const matchesCategory =
          selectedFilter === 'ALL' || rest.halalCategory === selectedFilter;
        return matchesCategory && inRange;
      });
  }, [
    restaurants,
    userLocation,
    maxDistanceMiles,
    selectedFilter,
    favorites,
    user,
  ]);

  const radiusGeoJSON = useMemo(
    () =>
      createGeoJSONCircle(
        [userLocation.longitude, userLocation.latitude],
        maxDistanceMiles
      ),
    [userLocation, maxDistanceMiles]
  );

  /* ------------------------- Owner actions ------------------------- */

  const openClaimModal = () => {
    setClaimError('');
    setClaimCodeInput('');
    setShowClaimModal(true);
  };

  const closeClaimModal = () => {
    setShowClaimModal(false);
    setClaimError('');
  };

  const handleOwnerTab = () => {
    if (isVerifiedOwner) setRole('OWNER');
    else openClaimModal();
  };

  // Claim codes are checked on the server via an RPC, so codes are never
  // readable from the browser. See the SQL for claim_restaurant().
  const handleClaim = async () => {
    const code = claimCodeInput.trim();
    if (!code || !user) return;
    setClaiming(true);
    setClaimError('');

    const { data, error } = await supabase.rpc('claim_restaurant', {
      p_code: code,
    });

    setClaiming(false);

    if (error) {
      if (error.code === '23505') {
        setClaimError('You have already claimed this restaurant.');
      } else if (error.message?.includes('invalid_code')) {
        setClaimError('Invalid claim code. Please check your code.');
      } else {
        setClaimError('Failed to claim restaurant: ' + error.message);
      }
      return;
    }

    const claimed = Array.isArray(data) ? data[0] : data;
    if (claimed?.id != null) {
      setOwnedRestaurantIds((prev) => Array.from(new Set([...prev, claimed.id])));
    }
    setRole('OWNER');
    closeClaimModal();
    setNotice(
      `Linked to ${claimed?.name ?? 'your restaurant'}. Welcome to your owner portal.`
    );
  };

  const handleSaveOwnerChanges = async () => {
    if (!ownedRestaurant || !user) return;
    setSaving(true);

    const media = {
      ...(ownedRestaurant.media || {}),
      SHOP_FRONT: editForm.shopFront.trim(),
      INTERIOR: editForm.interior.trim(),
      FOOD: editForm.food.trim(),
      MENU: editForm.menu.trim(),
    };
    const certificateLink = editForm.certificateLink.trim();

    // Row Level Security must restrict this to users in restaurant_owners.
    const { error } = await supabase
      .from('restaurants')
      .update({ certificate_link: certificateLink, media })
      .eq('id', ownedRestaurant.id);

    setSaving(false);

    if (error) {
      setNotice('Failed to update restaurant profile: ' + error.message);
      return;
    }

    setRestaurants((prev) =>
      prev.map((r) =>
        r.id === ownedRestaurant.id ? { ...r, certificateLink, media } : r
      )
    );
    setShowOwnerModal(false);
    setNotice('Restaurant details saved.');
  };

  /* ------------------------- Render ------------------------- */

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 pb-20 font-sans overflow-x-hidden">
      <style jsx global>{`
        .mapboxgl-popup-content {
          background: transparent !important;
          box-shadow: none !important;
          padding: 0 !important;
        }
        .mapboxgl-popup-anchor-top .mapboxgl-popup-tip {
          border-bottom-color: #0f172a !important;
        }
        .mapboxgl-popup-anchor-bottom .mapboxgl-popup-tip {
          border-top-color: #0f172a !important;
        }
        .mapboxgl-popup-anchor-left .mapboxgl-popup-tip {
          border-right-color: #0f172a !important;
        }
        .mapboxgl-popup-anchor-right .mapboxgl-popup-tip {
          border-left-color: #0f172a !important;
        }
      `}</style>

      {/* TOAST */}
      {notice && (
        <div
          role="status"
          className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[60] bg-slate-800 border border-slate-600 text-slate-100 text-xs font-semibold px-4 py-2.5 rounded-xl shadow-2xl max-w-[90vw]"
        >
          {notice}
        </div>
      )}

      {/* TOP HEADER */}
      <header className="sticky top-0 z-40 bg-slate-900/95 backdrop-blur border-b border-slate-800 px-4 py-3 shadow-md">
        <div className="max-w-6xl mx-auto flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="bg-gradient-to-r from-emerald-500 to-teal-400 text-slate-950 font-black px-3 py-1 rounded-xl text-sm tracking-tight shadow-sm">
              HALAL SCOUT UK
            </div>
            <span className="text-xs text-slate-400 hidden sm:inline">
              Waze-Style Discovery
            </span>
          </div>

          {/* MIDDLE: User / Owner toggle */}
          {user && (
            <div className="flex bg-slate-800 p-1 rounded-xl border border-slate-700 text-xs shadow-inner">
              <button
                onClick={() => setRole('USER')}
                className={`flex items-center gap-1.5 px-3 py-1 rounded-lg font-medium transition ${
                  role === 'USER'
                    ? 'bg-emerald-500 text-slate-950 font-bold shadow'
                    : 'text-slate-300 hover:text-white'
                }`}
              >
                <UserCheck className="w-3.5 h-3.5" /> User
              </button>
              <button
                onClick={handleOwnerTab}
                className={`flex items-center gap-1.5 px-3 py-1 rounded-lg font-medium transition ${
                  role === 'OWNER'
                    ? 'bg-amber-400 text-slate-950 font-bold shadow'
                    : 'text-slate-300 hover:text-white'
                }`}
              >
                <Store className="w-3.5 h-3.5" /> Owner{' '}
                {isVerifiedOwner ? '' : '🔒'}
              </button>
            </div>
          )}

          {/* RIGHT: Profile & Sign Out / Sign In */}
          <div className="flex items-center gap-3">
            {user && (
              <button
                onClick={() => setShowProfileModal(true)}
                className="flex items-center gap-2 bg-slate-800/90 hover:bg-slate-800 px-3.5 py-1.5 rounded-full text-xs border border-slate-700 shadow-inner transition cursor-pointer"
              >
                <Award className="w-4 h-4 text-amber-400" />
                <span className="font-bold text-white leading-tight">
                  {username ? `@${username}` : 'Profile'} ({myPoints} pts)
                </span>
              </button>
            )}

            {user ? (
              <button
                onClick={handleSignOut}
                title="Sign Out"
                aria-label="Sign out"
                className="flex items-center gap-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 p-2 sm:px-3.5 sm:py-1.5 rounded-xl text-xs font-bold border border-slate-700 transition shadow"
              >
                <LogOut className="w-4 h-4 text-rose-400" />
                <span className="hidden sm:inline">Sign Out</span>
              </button>
            ) : (
              <button
                onClick={() => {
                  setAuthMode('SIGNIN');
                  setAuthError('');
                  setShowAuthModal(true);
                }}
                className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-500 text-white px-3.5 py-1.5 rounded-xl text-xs font-bold transition shadow"
              >
                <LogIn className="w-3.5 h-3.5" /> Sign In / Up
              </button>
            )}
          </div>
        </div>
      </header>

      {/* MAIN CONTENT */}
      <main className="max-w-6xl mx-auto px-4 pt-6 space-y-6">
        {role === 'OWNER' ? (
          /* ============================ OWNER DASHBOARD ============================ */
          <div className="space-y-6">
            {!ownedRestaurant ? (
              <div className="bg-slate-900 border border-amber-500/30 rounded-2xl p-12 text-center space-y-3 shadow-2xl">
                <div className="w-12 h-12 rounded-full bg-amber-400/10 border border-amber-400/30 flex items-center justify-center text-amber-400 mx-auto">
                  <Store className="w-6 h-6" />
                </div>
                <h3 className="text-base font-bold text-white">
                  No Restaurant Linked
                </h3>
                <p className="text-xs text-slate-400 max-w-sm mx-auto">
                  You haven&apos;t claimed a restaurant yet. Use your unique
                  claim code to link your account to your shop.
                </p>
                <button
                  onClick={openClaimModal}
                  className="bg-amber-400 hover:bg-amber-300 text-slate-950 font-bold px-4 py-2 rounded-xl text-xs transition shadow"
                >
                  Enter Claim Code 🔑
                </button>
              </div>
            ) : (
              (() => {
                const avgRating = getAverageRating(ownedRestaurant.reviews);
                return (
                  <div className="space-y-6">
                    {/* Header banner */}
                    <div className="bg-gradient-to-r from-amber-500/10 via-slate-900 to-slate-900 border border-amber-500/30 rounded-2xl p-6 shadow-2xl flex flex-wrap items-center justify-between gap-4">
                      <div className="space-y-1">
                        <span className="bg-amber-400 text-slate-950 text-[10px] font-black px-2 py-0.5 rounded uppercase">
                          Verified Owner Portal
                        </span>
                        <h1 className="text-2xl font-black text-white">
                          {ownedRestaurant.name}
                        </h1>
                        <p className="text-xs text-slate-400">
                          {ownedRestaurant.city}, {ownedRestaurant.postcode} •{' '}
                          {ownedRestaurant.phone || 'No phone listed'}
                        </p>
                      </div>

                      <button
                        onClick={() => setShowOwnerModal(true)}
                        className="bg-amber-400 hover:bg-amber-300 text-slate-950 font-bold px-4 py-2.5 rounded-xl text-xs transition shadow flex items-center gap-2"
                      >
                        <Store className="w-4 h-4" /> Edit Profile & Photos
                      </button>
                    </div>

                    {/* Metrics */}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-1 shadow-xl">
                        <p className="text-xs font-semibold text-slate-400">
                          Live Community Rating
                        </p>
                        <div className="flex items-center gap-2">
                          <span className="text-2xl font-black text-white">
                            {avgRating || 'New'}
                          </span>
                          {avgRating && (
                            <Star className="w-5 h-5 text-amber-400 fill-amber-400" />
                          )}
                        </div>
                        <p className="text-[11px] text-slate-500">
                          Based on verified user feedback
                        </p>
                      </div>

                      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-1 shadow-xl">
                        <p className="text-xs font-semibold text-slate-400">
                          Total User Reviews
                        </p>
                        <p className="text-2xl font-black text-white">
                          {ownedRestaurant.reviews?.length || 0}
                        </p>
                        <p className="text-[11px] text-slate-500">
                          Customer feedback history
                        </p>
                      </div>

                      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-1 shadow-xl">
                        <p className="text-xs font-semibold text-slate-400">
                          Halal Certification
                        </p>
                        <p className="text-sm font-bold text-emerald-400 truncate pt-1">
                          {ownedRestaurant.certificateIssuer}
                        </p>
                        <a
                          href={
                            ownedRestaurant.certificateLink ||
                            ownedRestaurant.website ||
                            'https://halalhmc.org/outlets/'
                          }
                          target="_blank"
                          rel="noreferrer"
                          className="text-[11px] text-sky-400 hover:underline inline-flex items-center gap-1 pt-0.5"
                        >
                          View Official Registry ↗
                        </a>
                      </div>
                    </div>

                    {/* Media preview */}
                    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4 shadow-2xl">
                      <h3 className="text-sm font-bold text-white flex items-center gap-2">
                        <ImageIcon className="w-4 h-4 text-amber-400" /> Current
                        Storefront & Food Showcase
                      </h3>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        {MEDIA_TABS.map((m) => (
                          <div key={m.key} className="space-y-1.5">
                            <span className="text-xs text-slate-400 font-medium">
                              {m.label}
                            </span>
                            <div className="h-40 w-full rounded-xl border border-slate-800 bg-slate-950 overflow-hidden flex items-center justify-center">
                              {ownedRestaurant.media?.[m.key] ? (
                                <img
                                  src={ownedRestaurant.media[m.key]}
                                  alt={m.label}
                                  className="w-full h-full object-cover"
                                />
                              ) : (
                                <span className="text-xs text-slate-600">
                                  No photo uploaded
                                </span>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Reviews */}
                    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4 shadow-2xl">
                      <h3 className="text-sm font-bold text-white flex items-center gap-2">
                        <MessageSquare className="w-4 h-4 text-emerald-400" />{' '}
                        Customer Feedback & Reviews
                      </h3>
                      <div className="space-y-3">
                        {ownedRestaurant.reviews?.length > 0 ? (
                          ownedRestaurant.reviews.map((rev: any, i: number) => (
                            <div
                              key={rev.id || rev.created_at || i}
                              className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-2"
                            >
                              <div className="flex items-center justify-between">
                                <span className="font-bold text-xs text-white">
                                  @{rev.userName || rev.user_name}
                                </span>
                                <span className="flex items-center gap-1 bg-amber-400/20 text-amber-300 text-[10px] font-bold px-2 py-0.5 rounded border border-amber-400/40">
                                  <Star className="w-3 h-3 fill-current" />{' '}
                                  {rev.rating} / 5
                                </span>
                              </div>
                              <p className="text-xs text-slate-300">
                                {rev.comment}
                              </p>
                            </div>
                          ))
                        ) : (
                          <p className="text-xs text-slate-500 text-center py-6">
                            No reviews for your restaurant yet.
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })()
            )}
          </div>
        ) : (
          /* ============================ USER DISCOVERY ============================ */
          <div className="space-y-6">
            {/* MAP + SEARCH */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-2xl">
              <div className="p-3 bg-slate-900/95 border-b border-slate-800 flex flex-wrap items-center justify-between gap-3 text-xs font-semibold text-slate-300">
                <span className="flex items-center gap-1.5 text-emerald-400">
                  <Navigation className="w-4 h-4" /> Radar: {locationStatus}
                </span>

                <div className="flex items-center gap-2">
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      executeSearch(searchQuery);
                    }}
                    className="flex gap-2"
                  >
                    <div className="relative">
                      <Search className="absolute left-2.5 top-2 w-3.5 h-3.5 text-slate-400" />
                      <input
                        type="text"
                        placeholder="Search town, area or postcode..."
                        aria-label="Search town, area or postcode"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="bg-slate-950 border border-slate-700 rounded-xl pl-8 pr-3 py-1.5 text-xs text-white focus:outline-none focus:border-emerald-500 w-52 sm:w-64 shadow-inner"
                      />
                      {suggestions.length > 0 && (
                        <div className="absolute left-0 right-0 top-full mt-1.5 bg-slate-900 border border-slate-700 rounded-xl shadow-2xl z-50 overflow-hidden">
                          {suggestions.map((item) => (
                            <button
                              type="button"
                              key={item}
                              onClick={() => {
                                skipSuggestRef.current = true;
                                setSearchQuery(item);
                                setSuggestions([]);
                                executeSearch(item);
                              }}
                              className="w-full text-left px-3 py-2 text-xs text-slate-300 hover:bg-slate-800 hover:text-white cursor-pointer border-b border-slate-800 last:border-none flex items-center gap-2"
                            >
                              <MapPin className="w-3 h-3 text-emerald-400" />{' '}
                              {item}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                    <button
                      type="submit"
                      className="bg-emerald-600 hover:bg-emerald-500 text-white px-3.5 py-1.5 rounded-xl font-bold shadow transition"
                    >
                      Search
                    </button>
                  </form>

                  <button
                    onClick={handleResetToCurrentLocation}
                    title="Reset to Current Location"
                    className="flex items-center gap-1 bg-slate-800 hover:bg-slate-700 text-emerald-400 border border-slate-700 px-3 py-1.5 rounded-xl transition shadow"
                  >
                    <Crosshair className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">My Location</span>
                  </button>
                </div>
              </div>

              <div className="h-[280px] sm:h-[340px] w-full relative overflow-hidden isolate">
                <Map
                  {...viewState}
                  onMove={(evt) => setViewState(evt.viewState)}
                  style={{
                    width: '100%',
                    height: '100%',
                    position: 'absolute',
                    top: 0,
                    left: 0,
                  }}
                  mapStyle="mapbox://styles/mapbox/dark-v11"
                  mapboxAccessToken={process.env.NEXT_PUBLIC_MAPBOX_TOKEN}
                >
                  <Source id="radius-source" type="geojson" data={radiusGeoJSON}>
                    <Layer
                      id="radius-fill"
                      type="fill"
                      paint={{
                        'fill-color': '#10b981',
                        'fill-opacity': 0.08,
                      }}
                    />
                    <Layer
                      id="radius-border"
                      type="line"
                      paint={{
                        'line-color': '#10b981',
                        'line-width': 2,
                        'line-dasharray': [2, 2],
                      }}
                    />
                  </Source>

                  <Marker
                    latitude={userLocation.latitude}
                    longitude={userLocation.longitude}
                    anchor="center"
                  >
                    <div className="relative flex items-center justify-center">
                      <span className="absolute w-5 h-5 bg-sky-400/40 rounded-full animate-ping"></span>
                      <div className="w-2.5 h-2.5 bg-sky-500 rounded-full border border-white shadow-md"></div>
                    </div>
                  </Marker>

                  {filteredRestaurants.map((rest) => {
                    const isSelected = activeRestaurantId === rest.id;
                    return (
                      <Marker
                        key={rest.id}
                        latitude={rest.lat}
                        longitude={rest.lng}
                        anchor="center"
                        onClick={(e) => {
                          e.originalEvent.stopPropagation();
                          setActiveRestaurantId(rest.id);
                        }}
                      >
                        <div
                          className={`cursor-pointer rounded-full transition-all transform shadow-md ${
                            isSelected
                              ? 'w-4 h-4 bg-amber-400 border-2 border-white scale-125 z-30 shadow-amber-400/60'
                              : 'w-3 h-3 bg-emerald-500 hover:bg-emerald-400 border border-white/90 hover:scale-125'
                          }`}
                        ></div>
                      </Marker>
                    );
                  })}

                  {activeRestaurant && (
                    <Popup
                      latitude={activeRestaurant.lat}
                      longitude={activeRestaurant.lng}
                      anchor="top"
                      closeButton={false}
                      closeOnClick={false}
                    >
                      <div className="bg-slate-900 text-slate-100 border border-slate-700 p-1.5 pr-4 rounded-full shadow-2xl font-sans flex items-center gap-3">
                        <div className="h-7 px-2 rounded-full bg-amber-400/20 border border-amber-400/40 text-amber-300 flex items-center justify-center gap-1 font-bold text-xs shadow-inner">
                          <Star className="w-3.5 h-3.5 fill-current text-amber-400" />
                          {getAverageRating(activeRestaurant.reviews) || 'New'}
                        </div>
                        <span className="font-bold text-xs text-white tracking-tight">
                          {activeRestaurant.name}
                        </span>
                      </div>
                    </Popup>
                  )}
                </Map>
              </div>
            </div>

            {/* FILTERS */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-3 sm:p-4 shadow-lg space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2.5">
                <div className="flex items-center gap-2">
                  <span className="text-[11px] sm:text-xs font-bold uppercase tracking-wider text-slate-300">
                    Radius:
                  </span>
                  <div className="flex bg-slate-800 p-1 rounded-xl text-[11px] sm:text-xs gap-1 border border-slate-700">
                    {[
                      { label: 'Local', val: 0.5 },
                      { label: '1 mile', val: 1 },
                      { label: '5 mile', val: 5 },
                    ].map((item) => (
                      <button
                        key={item.val}
                        onClick={() => setMaxDistanceMiles(item.val)}
                        className={`px-2.5 py-1 rounded-lg font-semibold transition ${
                          maxDistanceMiles === item.val
                            ? 'bg-emerald-500 text-slate-950 shadow'
                            : 'text-slate-400 hover:text-white'
                        }`}
                      >
                        {item.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex flex-wrap gap-1 text-[11px] sm:text-xs">
                  {[
                    { id: 'ALL', label: 'All' },
                    { id: 'HMC_CERTIFIED', label: 'HMC' },
                    { id: 'HALAL_CERTIFIED', label: 'Halal Certified' },
                    { id: 'HALAL_OPTIONS', label: 'Halal Options' },
                    ...(user
                      ? [{ id: 'FAVOURITES', label: `❤️ (${favorites.length})` }]
                      : []),
                  ].map((tab) => (
                    <button
                      key={tab.id}
                      onClick={() => setSelectedFilter(tab.id)}
                      className={`px-2.5 py-1.5 rounded-xl font-medium border transition ${
                        selectedFilter === tab.id
                          ? 'bg-emerald-500/20 border-emerald-500 text-emerald-300 shadow'
                          : 'bg-slate-800/80 border-slate-700 text-slate-400 hover:bg-slate-800 hover:text-white'
                      }`}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* NEARBY SPOTS */}
            <section className="space-y-3">
              <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400 px-1">
                Nearby Spots ({filteredRestaurants.length} found)
              </h2>

              {filteredRestaurants.length === 0 ? (
                <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 text-center text-xs text-slate-400">
                  {selectedFilter === 'FAVOURITES'
                    ? "You haven't saved any favorite restaurants yet."
                    : `No restaurants found within ${maxDistanceMiles} miles of this location.`}
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {filteredRestaurants.map((rest) => {
                    const badge = getCategoryBadge(rest.halalCategory);
                    const isSelected = activeRestaurantId === rest.id;
                    const isFav = favorites.includes(rest.id);
                    const avgRating = getAverageRating(rest.reviews);

                    return (
                      <div
                        key={rest.id}
                        onClick={() => {
                          if (isSelected) {
                            setActiveRestaurantId(null);
                          } else {
                            setActiveRestaurantId(rest.id);
                            setMediaTab('FOOD');
                            setViewState((prev) => ({
                              ...prev,
                              latitude: rest.lat,
                              longitude: rest.lng,
                              zoom: 15,
                            }));
                          }
                        }}
                        className={`cursor-pointer rounded-2xl p-4 border transition transform hover:-translate-y-0.5 shadow-xl relative flex flex-col justify-between ${
                          isSelected
                            ? 'bg-slate-900 border-emerald-500 ring-2 ring-emerald-500/40 shadow-emerald-500/10 md:col-span-2'
                            : 'bg-slate-900/70 border-slate-800 hover:border-slate-700'
                        }`}
                      >
                        {user && (
                          <button
                            onClick={(e) => toggleFavorite(rest.id, e)}
                            title={
                              isFav ? 'Remove from Favorites' : 'Save to Favorites'
                            }
                            aria-label={
                              isFav ? 'Remove from favorites' : 'Save to favorites'
                            }
                            className="absolute top-4 right-4 p-2 rounded-full bg-slate-800 hover:bg-slate-700 border border-slate-700 transition shadow z-10"
                          >
                            <Heart
                              className={`w-4 h-4 ${
                                isFav
                                  ? 'text-rose-500 fill-rose-500'
                                  : 'text-slate-400 hover:text-white'
                              }`}
                            />
                          </button>
                        )}

                        <div>
                          <div className="flex flex-wrap items-center justify-between gap-2 pr-10">
                            <div className="flex items-center gap-2">
                              <h3 className="font-bold text-base text-white">
                                {rest.name}
                              </h3>
                              {avgRating ? (
                                <span className="flex items-center gap-1 bg-amber-400/20 text-amber-300 text-xs font-bold px-2 py-0.5 rounded border border-amber-400/40">
                                  <Star className="w-3 h-3 fill-current" />{' '}
                                  {avgRating} ({rest.reviews.length})
                                </span>
                              ) : (
                                <span className="text-[10px] bg-slate-800 text-slate-400 px-2 py-0.5 rounded border border-slate-700">
                                  No reviews yet
                                </span>
                              )}
                            </div>
                            <span className="text-emerald-400 font-bold font-mono text-xs bg-emerald-500/10 px-2 py-0.5 rounded-lg border border-emerald-500/30">
                              📍 {rest.distance.toFixed(1)} miles
                            </span>
                          </div>

                          <div className="flex items-center justify-between text-xs text-slate-400 mt-1">
                            <span>
                              {rest.city}, {rest.postcode}
                            </span>
                            {rest.servesAlcohol && (
                              <span className="inline-flex items-center gap-1 bg-amber-400/20 text-amber-300 text-[10px] font-bold px-2 py-0.5 rounded border border-amber-400/40">
                                <AlertTriangle className="w-3 h-3" /> Alcohol
                                Served
                              </span>
                            )}
                          </div>
                        </div>

                        {isSelected ? (
                          <div
                            className="mt-4 pt-4 border-t border-slate-800 space-y-4"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <span
                                className={`text-[11px] font-bold px-3 py-1 rounded-xl shadow-sm ${badge.color}`}
                              >
                                {badge.label}
                              </span>
                              <button
                                onClick={() => setShowCertModal(true)}
                                className="flex items-center gap-1.5 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 px-3 py-1.5 rounded-xl text-xs font-bold transition shadow"
                              >
                                <ShieldCheck className="w-4 h-4 text-emerald-400" />
                                View Certificate Link
                              </button>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                              <a
                                href={`https://www.google.com/maps/dir/?api=1&destination=${rest.lat},${rest.lng}`}
                                target="_blank"
                                rel="noreferrer"
                                className="flex items-center justify-center gap-1.5 bg-slate-800 hover:bg-slate-700 text-white py-2 px-3 rounded-xl text-xs font-semibold border border-slate-700 transition shadow"
                              >
                                <MapPin className="w-3.5 h-3.5 text-emerald-400" />{' '}
                                Directions
                              </a>
                              {rest.website &&
                                rest.website.trim() !== '' &&
                                rest.website !== '#' && (
                                  <a
                                    href={rest.website}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="flex items-center justify-center gap-1.5 bg-slate-800 hover:bg-slate-700 text-white py-2 px-3 rounded-xl text-xs font-semibold border border-slate-700 transition shadow"
                                  >
                                    <Globe className="w-3.5 h-3.5 text-sky-400" />{' '}
                                    Website
                                  </a>
                                )}
                              {rest.phone && (
                                <a
                                  href={`tel:${rest.phone}`}
                                  className="flex items-center justify-center gap-1.5 bg-slate-800 hover:bg-slate-700 text-white py-2 px-3 rounded-xl text-xs font-semibold border border-slate-700 transition shadow"
                                >
                                  <Phone className="w-3.5 h-3.5 text-amber-400" />{' '}
                                  Call
                                </a>
                              )}
                            </div>

                            {/* Media tabs */}
                            <div className="space-y-2">
                              <div className="flex flex-wrap gap-1 text-[11px]">
                                {MEDIA_TABS.map((m) => (
                                  <button
                                    key={m.key}
                                    onClick={() => setMediaTab(m.key)}
                                    className={`px-2.5 py-1 rounded-lg font-medium border transition ${
                                      mediaTab === m.key
                                        ? 'bg-emerald-500/20 border-emerald-500 text-emerald-300'
                                        : 'bg-slate-800/80 border-slate-700 text-slate-400 hover:text-white'
                                    }`}
                                  >
                                    {m.label}
                                  </button>
                                ))}
                              </div>
                              <div className="relative h-48 w-full overflow-hidden rounded-xl border border-slate-800 bg-slate-950 flex items-center justify-center">
                                {rest.media?.[mediaTab] ? (
                                  <img
                                    src={rest.media[mediaTab]}
                                    alt={`${rest.name} ${mediaTab
                                      .replace('_', ' ')
                                      .toLowerCase()}`}
                                    className="w-full h-full object-cover"
                                  />
                                ) : (
                                  <div className="flex flex-col items-center justify-center text-slate-500 space-y-1">
                                    <ImageIcon className="w-6 h-6 opacity-40" />
                                    <span className="text-[11px] font-semibold">
                                      No images posted yet
                                    </span>
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        ) : (
                          <div className="mt-3 flex items-center justify-between">
                            <span
                              className={`text-[11px] font-bold px-3 py-1 rounded-xl shadow-sm ${badge.color}`}
                            >
                              {badge.label}
                            </span>
                            <span className="text-xs text-slate-400 flex items-center gap-1 font-medium hover:text-white">
                              View details{' '}
                              <ChevronRight className="w-3.5 h-3.5 text-emerald-400" />
                            </span>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          </div>
        )}
      </main>

      {/* ============================ MODALS ============================ */}

      {/* PROFILE */}
      {showProfileModal && user && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-lg w-full p-6 space-y-5 shadow-2xl overflow-y-auto max-h-[90vh]">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="font-bold text-base text-white flex items-center gap-2">
                <User className="w-5 h-5 text-emerald-400" /> Private Scout
                Profile
              </h3>
              <button
                onClick={() => setShowProfileModal(false)}
                aria-label="Close"
                className="text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex items-center gap-4 bg-slate-800/60 p-4 rounded-xl border border-slate-800 shadow-inner">
              <div className="w-12 h-12 rounded-full bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 flex items-center justify-center font-black text-lg">
                {username ? username[0].toUpperCase() : 'S'}
              </div>
              <div className="space-y-0.5 flex-1">
                <h4 className="font-bold text-white text-base">
                  @{username || 'scout'}
                </h4>
                <p className="text-xs text-slate-400">{user.email}</p>
                <div className="pt-1">
                  <span
                    className={`text-[10px] font-bold px-2 py-0.5 rounded border ${
                      getUserTier(myPoints).color
                    }`}
                  >
                    {getUserTier(myPoints).badge}
                  </span>
                </div>
              </div>
            </div>

            {/* Tier progress */}
            {(() => {
              const tiers = [0, 200, 500, 1000];
              const names = [
                'Silver Scout (200 pts)',
                'Gold Scout (500 pts)',
                'Trusted Scout (1,000 pts)',
              ];
              const idx = tiers.filter((t) => myPoints >= t).length - 1;
              const maxed = idx >= tiers.length - 1;
              const floor = tiers[idx];
              const ceil = maxed ? 1000 : tiers[idx + 1];
              const progressPercent = maxed
                ? 100
                : Math.min(100, ((myPoints - floor) / (ceil - floor)) * 100);
              const nextTierName = maxed ? 'Max Rank Reached ⭐' : names[idx];

              return (
                <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800 space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-300 font-semibold flex items-center gap-1.5">
                      <Trophy className="w-3.5 h-3.5 text-amber-400" />{' '}
                      {maxed ? nextTierName : `Progress to ${nextTierName}`}
                    </span>
                    <span className="text-emerald-400 font-mono font-bold">
                      {myPoints} pts
                    </span>
                  </div>
                  <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden">
                    <div
                      className="bg-gradient-to-r from-emerald-500 to-teal-400 h-full rounded-full transition-all duration-500"
                      style={{ width: `${progressPercent}%` }}
                    ></div>
                  </div>
                </div>
              );
            })()}

            {/* Passport */}
            <div className="space-y-2 pt-1">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                <Compass className="w-3.5 h-3.5 text-emerald-400" /> Digital
                Halal Passport (Stamps)
              </h4>
              <div className="grid grid-cols-3 gap-2">
                <div className="bg-slate-950 p-2.5 rounded-xl border border-emerald-500/30 text-center space-y-0.5">
                  <span className="text-base">🇬🇧</span>
                  <p className="text-[11px] font-bold text-white">
                    London Scout
                  </p>
                  <span className="text-[9px] text-emerald-400 font-mono">
                    Unlocked
                  </span>
                </div>
                <div className="bg-slate-950 p-2.5 rounded-xl border border-slate-800 text-center space-y-0.5 opacity-60">
                  <span className="text-base">🏛️</span>
                  <p className="text-[11px] font-bold text-slate-400">
                    Birmingham
                  </p>
                  <span className="text-[9px] text-slate-500 font-mono">
                    0 / 3 Reviews
                  </span>
                </div>
                <div className="bg-slate-950 p-2.5 rounded-xl border border-slate-800 text-center space-y-0.5 opacity-60">
                  <span className="text-base">🏰</span>
                  <p className="text-[11px] font-bold text-slate-400">
                    Manchester
                  </p>
                  <span className="text-[9px] text-slate-500 font-mono">
                    0 / 3 Reviews
                  </span>
                </div>
              </div>
            </div>

            {/* Favourites */}
            <div className="space-y-2 pt-1">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                <Bookmark className="w-3.5 h-3.5 text-emerald-400" />{' '}
                Bookmarked Favorites ({favorites.length})
              </h4>
              <div className="max-h-28 overflow-y-auto space-y-1.5">
                {favorites.length > 0 ? (
                  favorites.map((favId) => {
                    const r = restaurants.find((item) => item.id === favId);
                    if (!r) return null;
                    return (
                      <button
                        key={favId}
                        onClick={() => {
                          setRole('USER');
                          setActiveRestaurantId(r.id);
                          moveTo(r.lat, r.lng, 15);
                          setShowProfileModal(false);
                        }}
                        className="w-full bg-slate-950 px-3 py-2 rounded-lg text-xs text-slate-300 flex items-center justify-between border border-slate-800/80 hover:border-emerald-500/50 hover:bg-slate-900 cursor-pointer transition shadow-inner group"
                      >
                        <span className="font-semibold text-white group-hover:text-emerald-400 transition">
                          {r.name}
                        </span>
                        <span className="text-slate-400 font-mono text-[11px]">
                          {r.city}
                        </span>
                      </button>
                    );
                  })
                ) : (
                  <p className="text-xs text-slate-500 text-center py-3">
                    No saved favorites yet.
                  </p>
                )}
              </div>
            </div>

            <div className="pt-2">
              <button
                onClick={() => setShowProfileModal(false)}
                className="w-full bg-slate-800 hover:bg-slate-700 text-white font-bold py-2 rounded-xl text-xs transition shadow"
              >
                Close Profile
              </button>
            </div>
          </div>
        </div>
      )}

      {/* AUTH */}
      {showAuthModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-sm w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="font-bold text-base text-white flex items-center gap-2">
                <LogIn className="w-4 h-4 text-emerald-400" />{' '}
                {authMode === 'SIGNIN'
                  ? 'Sign In to Halal Scout'
                  : 'Create Scout Account'}
              </h3>
              <button
                onClick={() => setShowAuthModal(false)}
                aria-label="Close"
                className="text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {authError && (
              <div className="bg-rose-950/40 border border-rose-500/40 text-rose-300 text-xs p-2.5 rounded-lg">
                {authError}
              </div>
            )}

            <form onSubmit={handleAuthSubmit} className="space-y-3 text-xs">
              <div>
                <label className="text-slate-400 font-medium">
                  Email Address:
                </label>
                <input
                  type="email"
                  required
                  autoComplete="email"
                  value={authEmail}
                  onChange={(e) => setAuthEmail(e.target.value)}
                  placeholder="name@example.com"
                  className="w-full mt-1 bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white"
                />
              </div>
              <div>
                <label className="text-slate-400 font-medium">Password:</label>
                <input
                  type="password"
                  required
                  minLength={6}
                  autoComplete={
                    authMode === 'SIGNIN' ? 'current-password' : 'new-password'
                  }
                  value={authPassword}
                  onChange={(e) => setAuthPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full mt-1 bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white"
                />
              </div>

              <button
                type="submit"
                className="w-full mt-2 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold py-2.5 rounded-lg transition shadow"
              >
                {authMode === 'SIGNIN' ? 'Sign In' : 'Sign Up'}
              </button>
            </form>

            <div className="text-center pt-2">
              <button
                onClick={() => {
                  setAuthError('');
                  setAuthMode(authMode === 'SIGNIN' ? 'SIGNUP' : 'SIGNIN');
                }}
                className="text-xs text-emerald-400 hover:underline"
              >
                {authMode === 'SIGNIN'
                  ? "Don't have an account? Sign up"
                  : 'Already have an account? Sign in'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* USERNAME */}
      {showUsernameModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/90 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-emerald-500/50 rounded-2xl max-w-sm w-full p-6 space-y-4 shadow-2xl">
            <div className="border-b border-slate-800 pb-3">
              <h3 className="font-bold text-base text-emerald-400 flex items-center gap-2">
                <User className="w-5 h-5 text-emerald-400" /> Choose Your Scout
                Username
              </h3>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed">
              Welcome to Halal Scout! Please pick a unique handle that will
              appear on your reviews and leaderboard profile.
            </p>

            {usernameError && (
              <div className="bg-rose-950/40 border border-rose-500/40 text-rose-300 text-xs p-2.5 rounded-lg">
                {usernameError}
              </div>
            )}

            <form onSubmit={handleSaveUsername} className="space-y-3 text-xs">
              <div>
                <label className="text-slate-400 font-medium">
                  Username Handle:
                </label>
                <div className="relative mt-1">
                  <span className="absolute left-3 top-2.5 text-slate-500 font-mono">
                    @
                  </span>
                  <input
                    type="text"
                    required
                    maxLength={30}
                    value={desiredUsername}
                    onChange={(e) => setDesiredUsername(e.target.value)}
                    placeholder="londonscout"
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg pl-7 pr-3 py-2 text-white font-mono"
                  />
                </div>
              </div>

              <button
                type="submit"
                className="w-full mt-2 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-extrabold py-2.5 rounded-lg transition shadow"
              >
                Save & Enter App
              </button>
            </form>
          </div>
        </div>
      )}

      {/* CLAIM CODE (single owner-verification modal) */}
      {showClaimModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-amber-500/40 rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="font-bold text-base text-amber-300 flex items-center gap-2">
                <KeyRound className="w-4 h-4 text-amber-400" /> Claim
                Restaurant Ownership
              </h3>
              <button
                onClick={closeClaimModal}
                aria-label="Close"
                className="text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-slate-300">
              Enter the unique claim code provided by HMC or your restaurant
              administrator to unlock the management portal for your shop.
            </p>

            <div className="space-y-3 pt-2">
              <input
                type="text"
                placeholder="e.g. A3F9K2"
                value={claimCodeInput}
                onChange={(e) => setClaimCodeInput(e.target.value.toUpperCase())}
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-4 py-3 text-white font-mono tracking-widest text-center text-lg uppercase"
              />
              {claimError && (
                <p className="text-rose-400 text-xs text-center font-medium">
                  {claimError}
                </p>
              )}
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-slate-800">
              <button
                onClick={closeClaimModal}
                className="px-4 py-2 rounded-xl bg-slate-800 text-slate-300 text-xs font-semibold hover:bg-slate-700"
              >
                Cancel
              </button>
              <button
                onClick={handleClaim}
                disabled={claiming || !claimCodeInput.trim()}
                className="px-4 py-2 rounded-xl bg-amber-400 text-slate-950 text-xs font-bold hover:bg-amber-300 shadow disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {claiming ? 'Verifying...' : 'Verify & Unlock Portal'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CERTIFICATE */}
      {showCertModal && activeRestaurant && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-base text-white flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-emerald-400" /> Halal
                Certificate
              </h3>
              <button
                onClick={() => setShowCertModal(false)}
                className="text-xs text-slate-400 hover:text-white"
              >
                Close ✕
              </button>
            </div>
            <div className="bg-slate-950 border border-emerald-500/30 rounded-xl p-4 space-y-3 text-xs shadow-inner">
              <div>
                <p className="text-slate-400">Restaurant Name:</p>
                <p className="font-bold text-white text-sm">
                  {activeRestaurant.name}
                </p>
              </div>
              <div>
                <p className="text-slate-400 pt-1">Certifying Body:</p>
                <p className="font-semibold text-emerald-400">
                  {activeRestaurant.certificateIssuer}
                </p>
              </div>
              {activeRestaurant.certificateNumber && (
                <div>
                  <p className="text-slate-400 pt-1">Certificate Reference:</p>
                  <p className="font-mono text-slate-200">
                    {activeRestaurant.certificateNumber}
                  </p>
                </div>
              )}
              <div className="pt-2">
                <a
                  href={
                    activeRestaurant.certificateLink ||
                    activeRestaurant.website ||
                    'https://halalhmc.org/outlets/'
                  }
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center justify-center gap-2 w-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-2.5 px-4 rounded-xl text-xs transition shadow"
                >
                  <Globe className="w-4 h-4" /> View Certificate on Website ↗
                </a>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* OWNER EDIT */}
      {showOwnerModal && ownedRestaurant && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-lg w-full p-6 space-y-4 shadow-2xl overflow-y-auto max-h-[90vh]">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="font-bold text-base text-white flex items-center gap-2">
                <Store className="w-5 h-5 text-amber-400" /> Media &
                Verification Portal
              </h3>
              <button
                onClick={() => setShowOwnerModal(false)}
                className="text-xs text-slate-400 hover:text-white"
              >
                Close ✕
              </button>
            </div>

            <div className="space-y-3 text-xs">
              {[
                { key: 'shopFront', label: 'Shop Front Image URL:' },
                { key: 'interior', label: 'Interior Image URL:' },
                { key: 'food', label: 'Food Shot Image URL:' },
                { key: 'menu', label: 'Menu Image URL:' },
                {
                  key: 'certificateLink',
                  label: 'Certificate Website Link:',
                },
              ].map((f) => (
                <div key={f.key}>
                  <label className="text-slate-400 font-medium">
                    {f.label}
                  </label>
                  <input
                    type="url"
                    value={(editForm as any)[f.key]}
                    onChange={(e) =>
                      setEditForm({ ...editForm, [f.key]: e.target.value })
                    }
                    placeholder="https://..."
                    className="w-full mt-1 bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white"
                  />
                </div>
              ))}
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-slate-800">
              <button
                onClick={() => setShowOwnerModal(false)}
                className="px-4 py-2 rounded-lg bg-slate-800 text-slate-300 text-xs font-semibold hover:bg-slate-700"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveOwnerChanges}
                disabled={saving}
                className="px-4 py-2 rounded-lg bg-amber-400 text-slate-950 text-xs font-bold hover:bg-amber-300 shadow disabled:opacity-50"
              >
                {saving ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
