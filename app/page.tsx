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
  CheckCircle2,
  Flag,
  ThumbsUp,
  Compass,
  Trophy,
} from 'lucide-react';

/* ------------------------------------------------------------------ */
/* Helpers                                                            */
/* ------------------------------------------------------------------ */

type MediaKey = 'SHOP_FRONT' | 'INTERIOR' | 'FOOD' | 'MENU';

// The order here is used everywhere: the photo tabs on each listing, the
// owner dashboard preview and the owner edit form. Change it in one place.
const MEDIA_TABS: { key: MediaKey; label: string }[] = [
  { key: 'SHOP_FRONT', label: 'Shop Front' },
  { key: 'INTERIOR', label: 'Interior' },
  { key: 'MENU', label: 'Menu' },
  { key: 'FOOD', label: 'Food' },
];

// Which owner-form field holds the image link for each photo type
const MEDIA_FORM_KEY: Record<MediaKey, 'shopFront' | 'interior' | 'menu' | 'food'> = {
  SHOP_FRONT: 'shopFront',
  INTERIOR: 'interior',
  MENU: 'menu',
  FOOD: 'food',
};

const LONDON = { latitude: 51.5074, longitude: -0.1278 };

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

// ---- Star ratings in half-star steps ----

function StarIcon({ fill, size }: { fill: number; size: string }) {
  return (
    <span className={`relative inline-block ${size}`}>
      <Star className={`absolute left-0 top-0 ${size} text-slate-600`} />
      <span
        className="absolute left-0 top-0 h-full overflow-hidden"
        style={{ width: `${fill}%` }}
      >
        <Star className={`${size} text-amber-400 fill-amber-400`} />
      </span>
    </span>
  );
}

function StarDisplay({
  value,
  size = 'w-3.5 h-3.5',
}: {
  value: number;
  size?: string;
}) {
  return (
    <span className="inline-flex gap-0.5">
      {[1, 2, 3, 4, 5].map((n) => (
        <StarIcon
          key={n}
          size={size}
          fill={value >= n ? 100 : value >= n - 0.5 ? 50 : 0}
        />
      ))}
    </span>
  );
}

// Tap the left half of a star for x.5, the right half for a whole number
function HalfStarPicker({
  value,
  onChange,
}: {
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="flex items-center gap-1">
      {[1, 2, 3, 4, 5].map((n) => (
        <span key={n} className="relative inline-block w-9 h-9">
          <StarIcon
            size="w-9 h-9"
            fill={value >= n ? 100 : value >= n - 0.5 ? 50 : 0}
          />
          <button
            type="button"
            aria-label={`${n - 0.5} stars`}
            onClick={() => onChange(n - 0.5)}
            className="absolute left-0 top-0 h-full w-1/2"
          />
          <button
            type="button"
            aria-label={`${n} star${n > 1 ? 's' : ''}`}
            onClick={() => onChange(n)}
            className="absolute right-0 top-0 h-full w-1/2"
          />
        </span>
      ))}
    </div>
  );
}

// Yes / No / Not sure chooser used for the quick questions
function TriChoice({
  label,
  value,
  onChange,
}: {
  label: string;
  value: boolean | null;
  onChange: (v: boolean | null) => void;
}) {
  const options: { text: string; v: boolean | null }[] = [
    { text: 'Yes', v: true },
    { text: 'No', v: false },
    { text: 'Not sure', v: null },
  ];
  return (
    <div className="space-y-1.5">
      <p className="text-xs text-slate-300 font-medium">{label}</p>
      <div className="flex gap-1.5">
        {options.map((o) => (
          <button
            key={o.text}
            type="button"
            onClick={() => onChange(o.v)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition ${
              value === o.v
                ? 'bg-emerald-500/20 border-emerald-500 text-emerald-300'
                : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-white'
            }`}
          >
            {o.text}
          </button>
        ))}
      </div>
    </div>
  );
}

// Tags that appear when enough reviewers agree (the rule lives in the database)
const TAG_STYLES: Record<string, { label: string; classes: string }> = {
  meat_yes: {
    label: 'Halal meat confirmed',
    classes: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40',
  },
  meat_no: {
    label: 'Halal meat not confirmed',
    classes: 'bg-rose-500/15 text-rose-300 border-rose-500/40',
  },
  prayer_yes: {
    label: 'Prayer space',
    classes: 'bg-sky-500/15 text-sky-300 border-sky-500/40',
  },
  prayer_no: {
    label: 'No prayer space',
    classes: 'bg-slate-500/20 text-slate-300 border-slate-500/40',
  },
  alcohol_yes: {
    label: 'Alcohol served',
    classes: 'bg-amber-400/20 text-amber-300 border-amber-400/40',
  },
  alcohol_no: {
    label: 'No alcohol',
    classes: 'bg-teal-500/15 text-teal-300 border-teal-500/40',
  },
};

const REPORT_KINDS: { value: string; label: string; hint: string }[] = [
  { value: 'closed', label: 'Closed down', hint: 'This place no longer exists.' },
  {
    value: 'wrong_details',
    label: 'Wrong details',
    hint: 'Address, phone number or website is wrong.',
  },
  {
    value: 'certification_concern',
    label: 'Certification concern',
    hint: 'The halal certification looks wrong or out of date.',
  },
];

// A written review needs at least this many characters (matches the database)
const MIN_REVIEW_CHARS = 20;
const MAX_REVIEW_CHARS = 1000;
const MAX_REVIEW_PHOTOS = 4;
const ALLOWED_PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

// Shrinks a photo and re-saves it as a JPEG. Re-saving also removes hidden
// camera data such as GPS location, so users don't share where they live.
async function resizeImage(
  file: File,
  maxSide = 1600,
  quality = 0.82
): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const w = Math.round(bitmap.width * scale);
  const h = Math.round(bitmap.height * scale);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas_unavailable');
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close?.();
  return await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('encode_failed'))),
      'image/jpeg',
      quality
    )
  );
}

function ReviewPhotoStrip({
  photos,
  urls,
}: {
  photos: { id: number; path: string }[];
  urls: Record<string, string>;
}) {
  const shown = (photos || []).filter((p) => urls[p.path]);
  if (shown.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1.5">
      {shown.map((p) => (
        <a key={p.id} href={urls[p.path]} target="_blank" rel="noreferrer">
          <img
            src={urls[p.path]}
            alt="Photo from a review"
            loading="lazy"
            className="w-16 h-16 object-cover rounded-lg border border-slate-800"
          />
        </a>
      ))}
    </div>
  );
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

// How long after expiry a lapsed shop stays publicly visible. This must match
// the 12-month grace period in the database function is_publicly_listed().
const MONTHS_VISIBLE_AFTER_EXPIRY = 12;

function parseDateOnly(s: string) {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function formatDate(d: Date) {
  return d.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

// Whole months and years only: "less than a month", "5 months", "1 year 2 months"
function timeSince(from: Date, to: Date) {
  let months =
    (to.getFullYear() - from.getFullYear()) * 12 +
    (to.getMonth() - from.getMonth());
  if (to.getDate() < from.getDate()) months -= 1;
  if (months >= 12) {
    const y = Math.floor(months / 12);
    const m = months % 12;
    return `${y} year${y > 1 ? 's' : ''}${
      m ? ` ${m} month${m > 1 ? 's' : ''}` : ''
    }`;
  }
  if (months >= 1) return `${months} month${months > 1 ? 's' : ''}`;
  return 'less than a month';
}

function certificationStatus(r: any): {
  state: 'ok' | 'lapsed' | 'options' | 'unknown';
  label: string;
  detail: string; // shown to the public: never contains certificate dates
  ownerDetail: string; // shown only in the owner dashboard
  hiddenFromPublic: boolean;
} {
  const cat = r.halalCategory;
  if (cat === 'HALAL_OPTIONS') {
    return {
      state: 'options',
      label: 'Halal Options',
      detail: 'Stated by the owner. Not independently verified.',
      ownerDetail: 'Stated by the owner. Not independently verified.',
      hiddenFromPublic: false,
    };
  }
  if (cat !== 'HMC_CERTIFIED' && cat !== 'HALAL_CERTIFIED') {
    return {
      state: 'unknown',
      label: cat || 'Not categorised',
      detail: '',
      ownerDetail: '',
      hiddenFromPublic: true,
    };
  }

  const name = cat === 'HMC_CERTIFIED' ? 'HMC' : 'Halal';
  const until = r.certification_valid_until
    ? parseDateOnly(r.certification_valid_until)
    : null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  if (until && until >= today) {
    return {
      state: 'ok',
      label: `${name} Certified`,
      detail: '',
      ownerDetail: `Valid until ${formatDate(until)}`,
      hiddenFromPublic: false,
    };
  }
  if (!until) {
    return {
      state: 'lapsed',
      label: `${name} Certification Not Renewed`,
      detail: 'No valid certificate on record',
      ownerDetail: 'No valid certificate on record',
      hiddenFromPublic: true,
    };
  }
  const cutoff = new Date(today);
  cutoff.setMonth(cutoff.getMonth() - MONTHS_VISIBLE_AFTER_EXPIRY);
  return {
    state: 'lapsed',
    label: `${name} Certification Not Renewed`,
    detail: `Certification expired ${timeSince(until, today)} ago`,
    ownerDetail: `Expired on ${formatDate(until)} (${timeSince(
      until,
      today
    )} ago)`,
    hiddenFromPublic: until < cutoff,
  };
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
  const [mediaTab, setMediaTab] = useState<MediaKey>(MEDIA_TABS[0].key);

  // Auth, favourites, profile & ownership
  const [user, setUser] = useState<any>(null);
  const [username, setUsername] = useState<string | null>(null);
  const [myPoints, setMyPoints] = useState(0);
  const [favorites, setFavorites] = useState<number[]>([]);
  const [visited, setVisited] = useState<number[]>([]);
  const [reviews, setReviews] = useState<any[]>([]);
  const [reviewsVersion, setReviewsVersion] = useState(0);
  const [showReviewModal, setShowReviewModal] = useState(false);
  const [reviewRating, setReviewRating] = useState(0);
  const [reviewFiles, setReviewFiles] = useState<File[]>([]);
  const [reviewProgress, setReviewProgress] = useState('');
  const [reviewRestaurant, setReviewRestaurant] = useState<{
    id: number;
    name: string;
  } | null>(null);
  const [editingReview, setEditingReview] = useState<any | null>(null);
  const [editingPhotos, setEditingPhotos] = useState<
    { id: number; path: string }[]
  >([]);
  const [showMyReviews, setShowMyReviews] = useState(false);
  const [myReviews, setMyReviews] = useState<any[]>([]);
  const [reviewComment, setReviewComment] = useState('');
  const [reviewMeat, setReviewMeat] = useState<boolean | null>(null);
  const [reviewPrayer, setReviewPrayer] = useState<boolean | null>(null);
  const [reviewAlcohol, setReviewAlcohol] = useState<boolean | null>(null);
  const [showReportModal, setShowReportModal] = useState(false);
  const [reportKind, setReportKind] = useState('');
  const [reportNote, setReportNote] = useState('');
  const [reportError, setReportError] = useState('');
  const [sendingReport, setSendingReport] = useState(false);
  const [photoUrls, setPhotoUrls] = useState<Record<string, string>>({});
  const [reviewError, setReviewError] = useState('');
  const [submittingReview, setSubmittingReview] = useState(false);
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
  const [team, setTeam] = useState<
    { user_id: string; username: string; is_you: boolean }[]
  >([]);
  const [teamError, setTeamError] = useState('');

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
        fetchVisited();
        checkUserProfile(u.id);
      } else {
        setFavorites([]);
        setVisited([]);
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

    // Saved by a database function so users can never write their own points
    const { error } = await supabase.rpc('set_username', {
      p_username: trimmed,
    });

    if (error) {
      setUsernameError(
        error.code === '23505'
          ? 'This username is already taken. Please choose another.'
          : error.message.includes('invalid_username')
          ? 'Use 3-30 letters, numbers or underscores.'
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

  /* ------------------------- Community: visits & reviews ------------------------- */

  async function fetchVisited() {
    const { data, error } = await supabase
      .from('check_ins')
      .select('restaurant_id');
    if (!error && data) setVisited(data.map((v: any) => v.restaurant_id));
  }

  async function refreshPoints(userId: string) {
    const { data } = await supabase
      .from('profiles')
      .select('points')
      .eq('id', userId)
      .maybeSingle();
    if (data?.points != null) {
      setMyPoints(data.points);
      return data.points as number;
    }
    return null;
  }

  async function fetchRatingStats() {
    const { data } = await supabase.rpc('get_rating_stats');
    const map: Record<number, { avg: string; count: number }> = {};
    ((data as any[]) ?? []).forEach((s) => {
      map[s.restaurant_id] = {
        avg: Number(s.avg_rating).toFixed(1),
        count: Number(s.review_count),
      };
    });
    return map;
  }

  async function fetchTags() {
    const { data } = await supabase.rpc('get_restaurant_tags');
    const map: Record<number, string[]> = {};
    ((data as any[]) ?? []).forEach((t) => {
      (map[t.restaurant_id] = map[t.restaurant_id] || []).push(t.tag);
    });
    return map;
  }

  async function refreshRatings() {
    const [stats, tags] = await Promise.all([fetchRatingStats(), fetchTags()]);
    setRestaurants((prev) =>
      prev.map((r) => ({
        ...r,
        avgRating: stats[r.id]?.avg ?? null,
        reviewCount: stats[r.id]?.count ?? 0,
        tags: tags[r.id] ?? [],
      }))
    );
  }

  const requireSignIn = () => {
    setNotice('Please sign in to join the community.');
    setAuthMode('SIGNIN');
    setAuthError('');
    setShowAuthModal(true);
  };

  const toggleVisited = async (restaurantId: number, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!user) {
      requireSignIn();
      return;
    }
    const wasVisited = visited.includes(restaurantId);
    const { error } = await supabase.rpc(
      wasVisited ? 'unmark_visited' : 'mark_visited',
      { p_restaurant_id: restaurantId }
    );
    if (error) {
      setNotice(
        error.message.includes('owner_cannot_check_in')
          ? "You can't check in at a shop you own."
          : 'Could not update your visit. Please try again.'
      );
      return;
    }
    setVisited((prev) =>
      wasVisited
        ? prev.filter((id) => id !== restaurantId)
        : [...prev, restaurantId]
    );
  };

  async function loadMyReviews() {
    const { data, error } = await supabase.rpc('get_my_reviews');
    setMyReviews(error ? [] : ((data as any[]) ?? []));
  }

  // Opens the review form for a restaurant, new or existing
  const startReview = (
    target: { id: number; name: string },
    existing: any | null
  ) => {
    setReviewRestaurant(target);
    setEditingReview(existing);
    setEditingPhotos(existing?.photos ?? []);
    setReviewRating(existing ? Number(existing.rating) : 0);
    setReviewComment(existing?.comment ?? '');
    setReviewMeat(existing?.meat ?? null);
    setReviewPrayer(existing?.prayer ?? null);
    setReviewAlcohol(existing?.alcohol ?? null);
    setReviewFiles([]);
    setReviewProgress('');
    setReviewError('');
    setShowReviewModal(true);
  };

  // From a restaurant card
  const openReviewModal = () => {
    if (!user) {
      requireSignIn();
      return;
    }
    if (!activeRestaurant) return;
    const mine = reviews.find((r) => r.is_mine);
    startReview(
      { id: activeRestaurant.id, name: activeRestaurant.name },
      mine
        ? {
            id: mine.id,
            rating: mine.rating,
            comment: mine.comment,
            like_count: Number(mine.like_count || 0),
            photos: mine.photos ?? [],
            meat: mine.my_meat_confirmed,
            prayer: mine.my_prayer_space,
            alcohol: mine.my_alcohol_served,
          }
        : null
    );
  };

  // From the "My reviews" list
  const editMyReview = (rv: any) => {
    setShowMyReviews(false);
    startReview(
      { id: rv.restaurant_id, name: rv.restaurant_name },
      {
        id: rv.id,
        rating: rv.rating,
        comment: rv.comment,
        like_count: Number(rv.like_count || 0),
        photos: rv.photos ?? [],
        meat: rv.meat_confirmed,
        prayer: rv.prayer_space,
        alcohol: rv.alcohol_served,
      }
    );
  };

  const handlePickPhotos = (e: React.ChangeEvent<HTMLInputElement>) => {
    const room =
      MAX_REVIEW_PHOTOS - editingPhotos.length - reviewFiles.length;
    const picked = Array.from(e.target.files ?? []).filter(
      (f) => ALLOWED_PHOTO_TYPES.includes(f.type) && f.size <= 15 * 1024 * 1024
    );
    if (picked.length < (e.target.files?.length ?? 0)) {
      setReviewError('Only JPEG, PNG or WebP photos under 15 MB are accepted.');
    }
    setReviewFiles((prev) => [...prev, ...picked.slice(0, Math.max(0, room))]);
    e.target.value = '';
  };

  const handleSubmitReview = async () => {
    if (!reviewRestaurant || !user) return;
    if (reviewRating < 0.5) {
      setReviewError('Please choose a star rating.');
      return;
    }
    const flat = reviewComment.replace(/\s+/g, ' ').trim();
    if (flat.length > 0 && flat.length < MIN_REVIEW_CHARS) {
      setReviewError(
        `A written review needs at least ${MIN_REVIEW_CHARS} characters. You can also leave it empty and just rate.`
      );
      return;
    }

    // Editing resets thumbs up, so make sure the person knows first
    const likes = Number(editingReview?.like_count || 0);
    if (editingReview && likes > 0) {
      const changed =
        Number(editingReview.rating) !== reviewRating ||
        (editingReview.comment ?? '') !== reviewComment.trim() ||
        (editingReview.meat ?? null) !== reviewMeat ||
        (editingReview.prayer ?? null) !== reviewPrayer ||
        (editingReview.alcohol ?? null) !== reviewAlcohol ||
        reviewFiles.length > 0;
      if (
        changed &&
        !window.confirm(
          `Saving changes resets your ${likes} thumbs up and removes the ${likes} point${
            likes > 1 ? 's' : ''
          } you earned from them. Continue?`
        )
      ) {
        return;
      }
    }

    const pointsBefore = myPoints;
    setSubmittingReview(true);
    setReviewError('');
    setReviewProgress('');

    const { error } = await supabase.rpc('submit_review', {
      p_restaurant_id: reviewRestaurant.id,
      p_rating: reviewRating,
      p_meat_confirmed: reviewMeat,
      p_prayer_space: reviewPrayer,
      p_alcohol_served: reviewAlcohol,
      p_comment: reviewComment.trim() || null,
    });

    if (error) {
      setSubmittingReview(false);
      const m = error.message || '';
      setReviewError(
        m.includes('owner_cannot_review')
          ? "You can't review a shop you own."
          : m.includes('rate_limited')
          ? 'You have posted a lot of reviews today. Please try again tomorrow.'
          : m.includes('username_required')
          ? 'Please choose a username first.'
          : m.includes('restaurant_not_available')
          ? 'This restaurant is not available for reviews.'
          : m.includes('comment_too_short')
          ? `A written review needs at least ${MIN_REVIEW_CHARS} characters and a few words.`
          : m.includes('comment_looks_like_spam')
          ? 'Please write a real review, not repeated characters.'
          : m.includes('no_links')
          ? 'Please remove web links from your review.'
          : m.includes('comment_too_long')
          ? `Reviews can be up to ${MAX_REVIEW_CHARS} characters.`
          : 'Could not save your review. Please try again.'
      );
      return;
    }

    // Photos: shrink, upload privately, then attach to the review
    let failed = 0;
    for (let i = 0; i < reviewFiles.length; i++) {
      setReviewProgress(`Uploading photo ${i + 1} of ${reviewFiles.length}...`);
      try {
        const blob = await resizeImage(reviewFiles[i]);
        const path = `${user.id}/${reviewRestaurant.id}/${crypto.randomUUID()}.jpg`;
        const { error: upErr } = await supabase.storage
          .from('review-photos')
          .upload(path, blob, { contentType: 'image/jpeg', upsert: false });
        if (upErr) throw upErr;
        const { error: addErr } = await supabase.rpc('add_review_photo', {
          p_restaurant_id: reviewRestaurant.id,
          p_file_path: path,
        });
        if (addErr) {
          await supabase.storage.from('review-photos').remove([path]);
          throw addErr;
        }
      } catch {
        failed += 1;
      }
    }

    setSubmittingReview(false);
    setReviewProgress('');
    setShowReviewModal(false);
    const pointsAfter = await refreshPoints(user.id);
    const diff = pointsAfter != null ? pointsAfter - pointsBefore : 0;
    const pointsNote =
      diff > 0
        ? ` You earned ${diff} points.`
        : diff < 0
        ? ` Your thumbs up were reset (${diff} points).`
        : '';
    setNotice(
      failed > 0
        ? `Saved, but ${failed} photo${failed > 1 ? 's' : ''} could not be uploaded.${pointsNote}`
        : `${editingReview ? 'Review updated.' : 'Thanks! Your review is live.'}${pointsNote}`
    );
    setReviewsVersion((v) => v + 1);
    refreshRatings();
    loadMyReviews();
  };

  const handleRemovePhoto = async (photoId: number) => {
    const likes = Number(editingReview?.like_count || 0);
    if (
      likes > 0 &&
      !window.confirm(
        `Removing a photo resets your ${likes} thumbs up and removes the points you earned from them. Continue?`
      )
    ) {
      return;
    }
    const { data: path, error } = await supabase.rpc('delete_review_photo', {
      p_photo_id: photoId,
    });
    if (error) {
      setNotice('Could not remove that photo.');
      return;
    }
    if (typeof path === 'string') {
      await supabase.storage.from('review-photos').remove([path]);
    }
    setEditingPhotos((prev) => prev.filter((p) => p.id !== photoId));
    setEditingReview((prev: any) => (prev ? { ...prev, like_count: 0 } : prev));
    if (user) refreshPoints(user.id);
    setReviewsVersion((v) => v + 1);
    loadMyReviews();
  };

  const handleDeleteReview = async (restaurantId: number) => {
    if (
      !window.confirm(
        'Delete this review? You will also lose the points it earned, including any from thumbs up.'
      )
    ) {
      return;
    }
    const { data, error } = await supabase.rpc('delete_my_review', {
      p_restaurant_id: restaurantId,
    });
    if (error) {
      setNotice('Could not delete your review.');
      return;
    }
    if (Array.isArray(data) && data.length > 0) {
      await supabase.storage.from('review-photos').remove(data as string[]);
    }
    if (user) refreshPoints(user.id);
    setReviewsVersion((v) => v + 1);
    refreshRatings();
    loadMyReviews();
    setNotice('Review deleted.');
  };

  const openReportModal = () => {
    if (!user) {
      requireSignIn();
      return;
    }
    setReportKind('');
    setReportNote('');
    setReportError('');
    setShowReportModal(true);
  };

  const handleSendReport = async () => {
    if (!activeRestaurant || !user) return;
    if (!reportKind) {
      setReportError('Please choose what the problem is.');
      return;
    }
    setSendingReport(true);
    setReportError('');
    const { error } = await supabase.rpc('report_listing', {
      p_restaurant_id: activeRestaurant.id,
      p_kind: reportKind,
      p_note: reportNote.trim() || null,
    });
    setSendingReport(false);
    if (error) {
      const m = error.message || '';
      setReportError(
        m.includes('rate_limited')
          ? 'You have sent a lot of reports today. Please try again tomorrow.'
          : m.includes('username_required')
          ? 'Please choose a username first.'
          : 'Could not send your report. Please try again.'
      );
      return;
    }
    setShowReportModal(false);
    setNotice('Thanks, we will check this listing.');
  };

  const handleReportReview = async (reviewId: number) => {
    if (!user) {
      requireSignIn();
      return;
    }
    if (!window.confirm('Report this review to the moderators?')) return;
    const { error } = await supabase.rpc('report_review', {
      p_review_id: reviewId,
      p_reason: 'reported by user',
    });
    setNotice(
      error ? 'Could not send your report.' : 'Thanks, we will take a look.'
    );
  };

  const handleToggleLike = async (rev: any) => {
    if (!user) {
      requireSignIn();
      return;
    }
    if (rev.is_mine) return;
    const { data, error } = await supabase.rpc('toggle_review_like', {
      p_review_id: rev.id,
    });
    if (error) {
      setNotice(
        error.message.includes('cannot_like_own_review')
          ? "You can't like your own review."
          : 'Could not update your like. Please try again.'
      );
      return;
    }
    const nowLiked = data === true;
    setReviews((prev) =>
      prev.map((r) =>
        r.id === rev.id
          ? {
              ...r,
              liked_by_me: nowLiked,
              like_count: Number(r.like_count || 0) + (nowLiked ? 1 : -1),
            }
          : r
      )
    );
  };

  /* ------------------------- Restaurants ------------------------- */

  useEffect(() => {
    async function fetchRestaurants() {
      const [{ data, error }, stats, tags] = await Promise.all([
        supabase
          .from('restaurants')
          // Reads every column, so new columns never need an app change. Keep
          // secrets (claim codes, user IDs) out of this table: it is public.
          .select('*'),
        fetchRatingStats(),
        fetchTags(),
      ]);
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
            certificateIssuer: r.certificate_issuer || null,
            certificateNumber: r.certificate_number || null,
            certificateLink: r.certificate_link || '',
            media: r.media || {},
            avgRating: stats[r.id]?.avg ?? null,
            reviewCount: stats[r.id]?.count ?? 0,
            tags: tags[r.id] ?? [],
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

  // Reviews for whichever restaurant is open (owners see their own shop's)
  const reviewsTargetId =
    role === 'OWNER' ? ownedRestaurant?.id ?? null : activeRestaurantId;
  const myReview = reviews.find((r) => r.is_mine) || null;

  useEffect(() => {
    setReviews([]);
    if (reviewsTargetId == null) return;
    let cancelled = false;
    supabase
      .rpc('get_restaurant_reviews', { p_restaurant_id: reviewsTargetId })
      .then(({ data, error }) => {
        if (cancelled) return;
        setReviews(error ? [] : ((data as any[]) ?? []));
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reviewsTargetId, reviewsVersion]);

  // Photos are stored privately, so each one needs a short-lived link
  useEffect(() => {
    const paths = [...reviews, ...myReviews].flatMap((r) =>
      Array.isArray(r.photos) ? r.photos.map((ph: any) => ph.path as string) : []
    );
    const missing = paths.filter((pth) => !photoUrls[pth]);
    if (missing.length === 0) return;
    let cancelled = false;
    supabase.storage
      .from('review-photos')
      .createSignedUrls(missing, 3600)
      .then(({ data }) => {
        if (cancelled || !data) return;
        setPhotoUrls((prev) => {
          const next = { ...prev };
          data.forEach((d: any) => {
            if (d.signedUrl && d.path) next[d.path] = d.signedUrl;
          });
          return next;
        });
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reviews, myReviews]);

  // Who has access to this shop's owner portal (only owners can ask)
  useEffect(() => {
    if (!ownedRestaurant || role !== 'OWNER') {
      setTeam([]);
      return;
    }
    let cancelled = false;
    supabase
      .rpc('get_restaurant_team', { p_restaurant_id: ownedRestaurant.id })
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) {
          setTeamError('Could not load who has access.');
          setTeam([]);
        } else {
          setTeamError('');
          setTeam((data as any[]) ?? []);
        }
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ownedRestaurant?.id, role]);

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
                onClick={() => {
                  setShowProfileModal(true);
                  if (user) {
                    refreshPoints(user.id);
                    loadMyReviews();
                  }
                }}
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
                const avgRating = ownedRestaurant.avgRating;
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
                          {ownedRestaurant.reviewCount || 0}
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
                        {(() => {
                          const st = certificationStatus(ownedRestaurant);
                          return (
                            <>
                              <p
                                className={`text-xs font-semibold ${
                                  st.state === 'lapsed'
                                    ? 'text-amber-300'
                                    : 'text-slate-200'
                                }`}
                              >
                                {st.label}
                              </p>
                              {st.ownerDetail && (
                                <p className="text-[11px] text-slate-400">
                                  {st.ownerDetail}
                                </p>
                              )}
                              {st.hiddenFromPublic && (
                                <p className="text-[11px] font-semibold text-rose-400">
                                  Hidden from the public until you upload a
                                  certificate.
                                </p>
                              )}
                            </>
                          );
                        })()}
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

                    {/* People with access */}
                    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-3 shadow-2xl">
                      <h3 className="text-sm font-bold text-white flex items-center gap-2">
                        <UserCheck className="w-4 h-4 text-amber-400" /> People
                        with access ({team.length})
                      </h3>
                      <p className="text-xs text-slate-400">
                        Everyone listed here can edit this shop&apos;s profile and
                        photos.
                      </p>
                      {teamError ? (
                        <p className="text-xs text-rose-400">{teamError}</p>
                      ) : (
                        <ul className="space-y-1.5">
                          {team.map((m) => (
                            <li
                              key={m.user_id}
                              className="flex items-center justify-between bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs"
                            >
                              <span className="font-semibold text-white">
                                @{m.username}
                              </span>
                              {m.is_you && (
                                <span className="text-[10px] font-bold text-amber-300 bg-amber-400/20 border border-amber-400/40 px-2 py-0.5 rounded">
                                  You
                                </span>
                              )}
                            </li>
                          ))}
                        </ul>
                      )}
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
                        Customer Ratings & Photos
                      </h3>
                      <div className="space-y-3">
                        {reviews.length > 0 ? (
                          reviews.map((rev: any) => (
                            <div
                              key={rev.id}
                              className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-2"
                            >
                              <div className="flex items-center justify-between">
                                <span className="font-bold text-xs text-white">
                                  @{rev.username}
                                </span>
                                <span className="flex items-center gap-1.5 text-amber-300 text-xs font-bold">
                                  <StarDisplay value={Number(rev.rating)} />
                                  {Number(rev.rating).toFixed(1)}
                                </span>
                              </div>
                              {rev.comment && (
                                <p className="text-xs text-slate-300 whitespace-pre-wrap break-words">
                                  {rev.comment}
                                </p>
                              )}
                              <ReviewPhotoStrip
                                photos={rev.photos}
                                urls={photoUrls}
                              />
                            </div>
                          ))
                        ) : (
                          <p className="text-xs text-slate-500 text-center py-6">
                            No ratings for your restaurant yet.
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
                          {activeRestaurant.avgRating || 'New'}
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
                    const status = certificationStatus(rest);
                    const badge =
                      status.state === 'lapsed'
                        ? { label: status.label, color: 'bg-amber-600 text-white' }
                        : getCategoryBadge(rest.halalCategory);
                    const isSelected = activeRestaurantId === rest.id;
                    const isFav = favorites.includes(rest.id);
                    const avgRating = rest.avgRating;

                    return (
                      <div
                        key={rest.id}
                        onClick={() => {
                          if (isSelected) {
                            setActiveRestaurantId(null);
                          } else {
                            setActiveRestaurantId(rest.id);
                            setMediaTab(MEDIA_TABS[0].key);
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
                                  {avgRating} ({rest.reviewCount})
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

                          {(rest.tags ?? []).filter(
                            (t: string) =>
                              TAG_STYLES[t] &&
                              !(t === 'alcohol_yes' && rest.servesAlcohol)
                          ).length > 0 && (
                            <div className="flex flex-wrap gap-1.5 mt-2">
                              {(rest.tags ?? [])
                                .filter(
                                  (t: string) =>
                                    TAG_STYLES[t] &&
                                    !(t === 'alcohol_yes' && rest.servesAlcohol)
                                )
                                .map((t: string) => (
                                  <span
                                    key={t}
                                    title="Based on what reviewers reported"
                                    className={`inline-flex items-center text-[10px] font-bold px-2 py-0.5 rounded border ${TAG_STYLES[t].classes}`}
                                  >
                                    {TAG_STYLES[t].label}
                                  </span>
                                ))}
                            </div>
                          )}
                        </div>

                        {status.detail && (
                          <p
                            className={`mt-2 text-[11px] font-medium flex items-center gap-1 ${
                              status.state === 'lapsed'
                                ? 'text-amber-300'
                                : 'text-slate-400'
                            }`}
                          >
                            {status.state === 'lapsed' && (
                              <AlertTriangle className="w-3 h-3" />
                            )}
                            {status.detail}
                          </p>
                        )}

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

                            {/* Community: visits and reviews */}
                            <div className="space-y-3 pt-3 border-t border-slate-800">
                              {user && (
                              <div className="flex flex-wrap gap-2">
                                <button
                                  onClick={(e) => toggleVisited(rest.id, e)}
                                  className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold border transition ${
                                    visited.includes(rest.id)
                                      ? 'bg-emerald-500/20 border-emerald-500 text-emerald-300'
                                      : 'bg-slate-800 border-slate-700 text-slate-200 hover:bg-slate-700'
                                  }`}
                                >
                                  <CheckCircle2 className="w-3.5 h-3.5" />
                                  {visited.includes(rest.id)
                                    ? "I've eaten here"
                                    : 'Mark as visited'}
                                </button>
                                <button
                                  onClick={openReviewModal}
                                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold border border-slate-700 bg-slate-800 text-slate-200 hover:bg-slate-700 transition"
                                >
                                  <MessageSquare className="w-3.5 h-3.5 text-emerald-400" />
                                  {myReview ? 'Edit your review' : 'Rate & review'}
                                </button>
                                <button
                                  onClick={openReportModal}
                                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold border border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700 transition"
                                >
                                  <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
                                  Report a problem
                                </button>
                              </div>
                              )}

                              {reviews.length === 0 ? (
                                <p className="text-xs text-slate-500">
                                  No reviews yet. Be the first to rate this place.
                                </p>
                              ) : (
                                <ul className="space-y-2">
                                  {reviews.map((rev: any) => (
                                    <li
                                      key={rev.id}
                                      className="bg-slate-950 border border-slate-800 rounded-xl p-3 space-y-1.5 text-xs"
                                    >
                                      <div className="flex items-center justify-between gap-2">
                                        <span className="font-bold text-white">
                                          @{rev.username}
                                          {rev.is_mine && (
                                            <span className="ml-1.5 text-[10px] text-amber-300">
                                              (you)
                                            </span>
                                          )}
                                        </span>
                                        <span className="flex items-center gap-1.5 text-amber-300 font-bold">
                                          <StarDisplay value={Number(rev.rating)} />
                                          {Number(rev.rating).toFixed(1)}
                                        </span>
                                      </div>
                                      {rev.comment && (
                                        <p className="text-slate-300 whitespace-pre-wrap break-words">
                                          {rev.comment}
                                        </p>
                                      )}
                                      <ReviewPhotoStrip
                                        photos={rev.photos}
                                        urls={photoUrls}
                                      />
                                      <div className="flex items-center justify-between text-[10px] text-slate-500">
                                        <span>
                                          {new Date(
                                            rev.created_at
                                          ).toLocaleDateString('en-GB', {
                                            month: 'short',
                                            year: 'numeric',
                                          })}
                                        </span>
                                        <div className="flex items-center gap-3">
                                          {user && !rev.is_mine ? (
                                            <button
                                              onClick={() => handleToggleLike(rev)}
                                              aria-label="Mark this review as helpful"
                                              className={`flex items-center gap-1 transition ${
                                                rev.liked_by_me
                                                  ? 'text-emerald-400'
                                                  : 'hover:text-white'
                                              }`}
                                            >
                                              <ThumbsUp
                                                className={`w-3 h-3 ${
                                                  rev.liked_by_me
                                                    ? 'fill-current'
                                                    : ''
                                                }`}
                                              />
                                              {Number(rev.like_count || 0)}
                                            </button>
                                          ) : (
                                            <span
                                              title={
                                                user
                                                  ? 'Your own review'
                                                  : 'Sign in to mark reviews as helpful'
                                              }
                                              className="flex items-center gap-1"
                                            >
                                              <ThumbsUp className="w-3 h-3" />
                                              {Number(rev.like_count || 0)}
                                            </span>
                                          )}
                                          {rev.is_mine ? (
                                            <button
                                              onClick={() =>
                                                handleDeleteReview(rest.id)
                                              }
                                              className="hover:text-rose-400"
                                            >
                                              Delete
                                            </button>
                                          ) : user ? (
                                            <button
                                              onClick={() =>
                                                handleReportReview(rev.id)
                                              }
                                              className="flex items-center gap-1 hover:text-white"
                                            >
                                              <Flag className="w-3 h-3" /> Report
                                            </button>
                                          ) : null}
                                        </div>
                                      </div>
                                    </li>
                                  ))}
                                </ul>
                              )}
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
                <p className="text-xs text-slate-400">
                  {visited.length} place{visited.length === 1 ? '' : 's'} visited
                </p>
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

            <button
              onClick={() => {
                setShowProfileModal(false);
                setShowMyReviews(true);
                loadMyReviews();
              }}
              className="w-full flex items-center justify-between bg-slate-800 hover:bg-slate-700 text-white font-bold px-4 py-2.5 rounded-xl text-xs transition shadow border border-slate-700"
            >
              <span className="flex items-center gap-2">
                <MessageSquare className="w-4 h-4 text-emerald-400" /> My reviews
              </span>
              <span className="text-slate-400 font-mono">{myReviews.length}</span>
            </button>

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

      {/* MY REVIEWS */}
      {showMyReviews && user && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-lg w-full p-6 space-y-4 shadow-2xl overflow-y-auto max-h-[90vh]">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="font-bold text-base text-white flex items-center gap-2">
                <MessageSquare className="w-5 h-5 text-emerald-400" /> My reviews
              </h3>
              <button
                onClick={() => setShowMyReviews(false)}
                aria-label="Close"
                className="text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-[11px] text-slate-400 leading-relaxed">
              Editing a review resets its thumbs up to zero and removes the
              points they earned you. Deleting a review removes all the points
              it earned.
            </p>

            {myReviews.length === 0 ? (
              <p className="text-xs text-slate-500 text-center py-6">
                You haven&apos;t reviewed anywhere yet.
              </p>
            ) : (
              <ul className="space-y-3">
                {myReviews.map((rv: any) => (
                  <li
                    key={rv.id}
                    className="bg-slate-950 border border-slate-800 rounded-xl p-4 space-y-2 text-xs"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="font-bold text-white text-sm">
                          {rv.restaurant_name}
                        </p>
                        {rv.restaurant_city && (
                          <p className="text-[11px] text-slate-500">
                            {rv.restaurant_city}
                          </p>
                        )}
                      </div>
                      <span className="flex items-center gap-1.5 text-amber-300 font-bold">
                        <StarDisplay value={Number(rv.rating)} />
                        {Number(rv.rating).toFixed(1)}
                      </span>
                    </div>

                    {rv.status === 'hidden' && (
                      <p className="text-[11px] text-rose-400 font-medium">
                        This review has been hidden by a moderator.
                      </p>
                    )}

                    {rv.comment && (
                      <p className="text-slate-300 whitespace-pre-wrap break-words">
                        {rv.comment}
                      </p>
                    )}
                    <ReviewPhotoStrip photos={rv.photos} urls={photoUrls} />

                    <div className="flex items-center justify-between pt-1 text-[11px] text-slate-500">
                      <span className="flex items-center gap-1">
                        <ThumbsUp className="w-3 h-3" />
                        {Number(rv.like_count || 0)} thumbs up ·{' '}
                        {new Date(rv.created_at).toLocaleDateString('en-GB', {
                          month: 'short',
                          year: 'numeric',
                        })}
                      </span>
                      <span className="flex items-center gap-3 text-xs font-semibold">
                        <button
                          onClick={() => editMyReview(rv)}
                          className="text-emerald-400 hover:text-emerald-300"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => handleDeleteReview(rv.restaurant_id)}
                          className="text-rose-400 hover:text-rose-300"
                        >
                          Delete
                        </button>
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            )}

            <button
              onClick={() => setShowMyReviews(false)}
              className="w-full bg-slate-800 hover:bg-slate-700 text-white font-bold py-2 rounded-xl text-xs transition shadow"
            >
              Close
            </button>
          </div>
        </div>
      )}

      {/* REVIEW */}
      {showReviewModal && reviewRestaurant && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl overflow-y-auto max-h-[90vh]">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="font-bold text-base text-white">
                {editingReview ? 'Edit your review of' : 'Rate'}{' '}
                {reviewRestaurant.name}
              </h3>
              <button
                onClick={() => setShowReviewModal(false)}
                aria-label="Close"
                className="text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-1">
              <HalfStarPicker value={reviewRating} onChange={setReviewRating} />
              <p className="text-xs text-slate-400">
                {reviewRating >= 0.5
                  ? `${reviewRating.toFixed(1)} out of 5`
                  : 'Tap a star. Tap the left half for a half star.'}
              </p>
            </div>

            <div className="space-y-1 border-t border-slate-800 pt-3">
              <label className="text-xs text-slate-300 font-medium">
                Write a review (optional)
              </label>
              <textarea
                value={reviewComment}
                onChange={(e) => setReviewComment(e.target.value)}
                maxLength={MAX_REVIEW_CHARS}
                rows={4}
                placeholder="What did you eat? How was the service? Anything others should know?"
                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white"
              />
              {(() => {
                const n = reviewComment.replace(/\s+/g, ' ').trim().length;
                return (
                  <p
                    className={`text-[11px] ${
                      n === 0
                        ? 'text-slate-500'
                        : n >= MIN_REVIEW_CHARS
                        ? 'text-emerald-400'
                        : 'text-amber-300'
                    }`}
                  >
                    {n === 0
                      ? `Write ${MIN_REVIEW_CHARS}+ characters to earn 5 points.`
                      : n >= MIN_REVIEW_CHARS
                      ? 'Great, this earns 5 points.'
                      : `${MIN_REVIEW_CHARS - n} more character${
                          MIN_REVIEW_CHARS - n === 1 ? '' : 's'
                        } to go.`}
                  </p>
                );
              })()}
            </div>

            <div className="space-y-3 border-t border-slate-800 pt-3">
              <p className="text-xs text-slate-400">
                Quick questions (optional). When enough people agree, they show
                as tags on the listing.
              </p>
              <TriChoice
                label="Did staff confirm the meat is halal?"
                value={reviewMeat}
                onChange={setReviewMeat}
              />
              <TriChoice
                label="Is there a prayer space?"
                value={reviewPrayer}
                onChange={setReviewPrayer}
              />
              <TriChoice
                label="Is alcohol served?"
                value={reviewAlcohol}
                onChange={setReviewAlcohol}
              />
            </div>

            <div className="space-y-2 border-t border-slate-800 pt-3">
              <label className="text-xs text-slate-300 font-medium">
                Photos (optional, up to {MAX_REVIEW_PHOTOS})
              </label>

              {editingPhotos.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {editingPhotos.map((ph) =>
                    photoUrls[ph.path] ? (
                      <div key={ph.id} className="relative">
                        <img
                          src={photoUrls[ph.path]}
                          alt="Your photo"
                          className="w-16 h-16 object-cover rounded-lg border border-slate-700"
                        />
                        <button
                          type="button"
                          onClick={() => handleRemovePhoto(ph.id)}
                          aria-label="Remove this photo"
                          className="absolute -top-1.5 -right-1.5 bg-slate-950 border border-slate-600 rounded-full p-0.5 text-slate-300 hover:text-rose-400"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    ) : null
                  )}
                </div>
              )}

              {reviewFiles.length > 0 && (
                <ul className="space-y-1">
                  {reviewFiles.map((f, i) => (
                    <li
                      key={`${f.name}-${i}`}
                      className="flex items-center justify-between bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-[11px] text-slate-300"
                    >
                      <span className="truncate pr-2">{f.name}</span>
                      <button
                        type="button"
                        onClick={() =>
                          setReviewFiles((prev) => prev.filter((_, j) => j !== i))
                        }
                        aria-label="Remove this photo"
                        className="text-slate-400 hover:text-rose-400"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}

              {editingPhotos.length + reviewFiles.length <
                MAX_REVIEW_PHOTOS && (
                <label className="flex items-center justify-center gap-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-xl px-3 py-2 text-xs font-semibold cursor-pointer transition">
                  <ImageIcon className="w-3.5 h-3.5 text-emerald-400" /> Add
                  photos
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    multiple
                    onChange={handlePickPhotos}
                    className="hidden"
                  />
                </label>
              )}
            </div>

            {reviewError && (
              <p className="text-xs text-rose-400 font-medium">{reviewError}</p>
            )}
            {reviewProgress && (
              <p className="text-xs text-slate-300">{reviewProgress}</p>
            )}
            {editingReview && Number(editingReview.like_count || 0) > 0 && (
              <p className="text-[11px] text-amber-300 font-medium">
                Heads up: your review has {Number(editingReview.like_count)} thumbs
                up. Changing it resets them to zero and removes the points they
                earned you.
              </p>
            )}

            <p className="text-[10px] text-slate-500 leading-relaxed">
              Reviews, ratings and photos are public and show your username. Be
              honest and respectful, and don&apos;t include web links or personal
              details. Only upload your own photos of the food or the restaurant,
              and avoid showing other people. Photos are resized and location
              data is removed before upload. Anything can be reported and
              removed. A written review earns 5 points, and each thumbs up on
              your review earns you 1 more.
            </p>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-800">
              <button
                onClick={() => setShowReviewModal(false)}
                className="px-4 py-2 rounded-lg bg-slate-800 text-slate-300 text-xs font-semibold hover:bg-slate-700"
              >
                Cancel
              </button>
              <button
                onClick={handleSubmitReview}
                disabled={submittingReview}
                className="px-4 py-2 rounded-lg bg-emerald-500 text-slate-950 text-xs font-bold hover:bg-emerald-400 shadow disabled:opacity-50"
              >
                {submittingReview ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* REPORT A PROBLEM */}
      {showReportModal && activeRestaurant && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl overflow-y-auto max-h-[90vh]">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="font-bold text-base text-white">
                Report a problem with {activeRestaurant.name}
              </h3>
              <button
                onClick={() => setShowReportModal(false)}
                aria-label="Close"
                className="text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-2">
              {REPORT_KINDS.map((k) => (
                <button
                  key={k.value}
                  type="button"
                  onClick={() => setReportKind(k.value)}
                  className={`w-full text-left px-3 py-2.5 rounded-xl border transition ${
                    reportKind === k.value
                      ? 'bg-emerald-500/15 border-emerald-500'
                      : 'bg-slate-800 border-slate-700 hover:bg-slate-700'
                  }`}
                >
                  <span className="block text-xs font-bold text-white">
                    {k.label}
                  </span>
                  <span className="block text-[11px] text-slate-400">
                    {k.hint}
                  </span>
                </button>
              ))}
            </div>

            <div>
              <label className="text-xs text-slate-400 font-medium">
                Anything we should know? (optional, only we see this)
              </label>
              <textarea
                value={reportNote}
                onChange={(e) => setReportNote(e.target.value)}
                maxLength={200}
                rows={3}
                className="w-full mt-1 bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white"
              />
              <p className="text-[10px] text-slate-500 text-right">
                {reportNote.length}/200
              </p>
            </div>

            {reportError && (
              <p className="text-xs text-rose-400 font-medium">{reportError}</p>
            )}

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-800">
              <button
                onClick={() => setShowReportModal(false)}
                className="px-4 py-2 rounded-lg bg-slate-800 text-slate-300 text-xs font-semibold hover:bg-slate-700"
              >
                Cancel
              </button>
              <button
                onClick={handleSendReport}
                disabled={sendingReport}
                className="px-4 py-2 rounded-lg bg-amber-400 text-slate-950 text-xs font-bold hover:bg-amber-300 shadow disabled:opacity-50"
              >
                {sendingReport ? 'Sending...' : 'Send report'}
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
                  {activeRestaurant.certificateIssuer || 'Not specified'}
                </p>
              </div>
              {(() => {
                const st = certificationStatus(activeRestaurant);
                return (
                  <div>
                    <p className="text-slate-400 pt-1">Status:</p>
                    <p
                      className={`font-semibold ${
                        st.state === 'lapsed'
                          ? 'text-amber-300'
                          : 'text-emerald-400'
                      }`}
                    >
                      {st.label}
                    </p>
                    {st.detail && <p className="text-slate-400">{st.detail}</p>}
                  </div>
                );
              })()}
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
                ...MEDIA_TABS.map((m) => ({
                  key: MEDIA_FORM_KEY[m.key] as string,
                  label: `${m.label} Image URL:`,
                })),
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
