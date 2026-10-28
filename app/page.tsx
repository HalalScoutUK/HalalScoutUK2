"use client";

import React, { useState, useEffect } from "react";
import Map, { Marker, Popup, Source, Layer } from "react-map-gl/mapbox";
import "mapbox-gl/dist/mapbox-gl.css";
import { createClient } from "@/lib/supabase/client";
import {
  ShieldCheck,
  AlertTriangle,
  MapPin,
  Phone,
  Globe,
  ThumbsUp,
  Award,
  Video,
  Image as ImageIcon,
  UserCheck,
  Store,
  CheckCircle2,
  Sparkles,
  Upload,
  Navigation,
  Search,
  Crosshair,
  Flame,
  ChevronRight,
  Play,
  X,
  Star,
  Heart,
  LogOut,
  LogIn,
  Lock,
  KeyRound,
  User,
  Bookmark,
  MessageSquare,
  Compass,
  Trophy,
} from "lucide-react";

// Distance calculation helper (Haversine formula in miles)
function calculateDistanceMiles(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 3958.8;
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function getAverageRating(reviews: any[]) {
  if (!reviews || reviews.length === 0) return null;
  const sum = reviews.reduce((acc, r) => acc + (r.rating || 5), 0);
  return (sum / reviews.length).toFixed(1);
}

function createGeoJSONCircle(center: [number, number], radiusInMiles: number, points = 64) {
  const km = radiusInMiles * 1.60934;
  const retCoords = [];
  const distanceX = km / (111.32 * Math.cos((center[1] * Math.PI) / 180));
  const distanceY = km / 110.574;

  for (let i = 0; i < points; i++) {
    const theta = (i / points) * (2 * Math.PI);
    const x = distanceX * Math.cos(theta);
    const y = distanceY * Math.sin(theta);
    retCoords.push([center[0] + x, center[1] + y]);
  }
  retCoords.push(retCoords[0]);

  return {
    type: "Feature" as const,
    geometry: {
      type: "Polygon" as const,
      coordinates: [retCoords],
    },
    properties: {},
  };
}

export default function UKHalalAppMapbox() {
  const supabase = createClient();

  const [role, setRole] = useState<"USER" | "OWNER">("USER");
  const [selectedFilter, setSelectedFilter] = useState<string>("ALL");
  const [maxDistanceMiles, setMaxDistanceMiles] = useState<number>(0.5);
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [suggestions, setSuggestions] = useState<string[]>([]);
  
  const [userLocation, setUserLocation] = useState({
    latitude: 51.5074,
    longitude: -0.1278,
  });

  const [viewState, setViewState] = useState({
    latitude: 51.5074,
    longitude: -0.1278,
    zoom: 14.2,
  });
  const [locationStatus, setLocationStatus] = useState("Detecting GPS...");

  const [restaurants, setRestaurants] = useState<any[]>([]);
  const [activeRestaurantId, setActiveRestaurantId] = useState<number | null>(null);
  const [mediaTab, setMediaTab] = useState<"SHOP_FRONT" | "INTERIOR" | "FOOD" | "MENU">("FOOD");

  // Auth, Favorites, Profile & Ownership state
  const [user, setUser] = useState<any>(null);
  const [username, setUsername] = useState<string | null>(null);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [showUsernameModal, setShowUsernameModal] = useState(false);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [desiredUsername, setDesiredUsername] = useState("");
  const [usernameError, setUsernameError] = useState("");

  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authMode, setAuthMode] = useState<"SIGNIN" | "SIGNUP">("SIGNIN");
  const [authError, setAuthError] = useState("");
  const [favorites, setFavorites] = useState<number[]>([]);
  
  const [isVerifiedOwner, setIsVerifiedOwner] = useState(false);
  const [showOwnerVerifyModal, setShowOwnerVerifyModal] = useState(false);
  const [certInput, setCertInput] = useState("");
  const [verifyError, setVerifyError] = useState("");

  const [showCertModal, setShowCertModal] = useState(false);
  const [showOwnerModal, setShowOwnerModal] = useState(false);
  
  // New users start from 0 points
  const [myPoints, setMyPoints] = useState(0);
  const [myTotalThumbsUp, setMyTotalThumbsUp] = useState(0); 
  const [newReviewText, setNewReviewText] = useState("");
  const [newReviewRating, setNewReviewRating] = useState<number>(5);
  const [reviewError, setReviewError] = useState("");

  const isTrustedScoutOrPrivileged = role === "OWNER" || isVerifiedOwner || myTotalThumbsUp >= 1000;

  // Check session and profile username on load
  useEffect(() => {
    async function getInitialSession() {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        setUser(session.user);
        fetchFavorites(session.user.id);
        checkUserProfile(session.user.id);
      }
    }

    getInitialSession();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      setUser(session?.user ?? null);
      if (session?.user) {
        fetchFavorites(session.user.id);
        checkUserProfile(session.user.id);
      } else {
        setFavorites([]);
        setUsername(null);
        setIsVerifiedOwner(false);
        setRole("USER");
        setMyPoints(0);
      }
    });

    return () => subscription.unsubscribe();
  }, [selectedFilter]);

  async function checkUserProfile(userId: string) {
    const { data, error } = await supabase
      .from("profiles")
      .select("username, points")
      .eq("id", userId)
      .single();

    if (error || !data?.username) {
      setShowUsernameModal(true);
    } else {
      setUsername(data.username);
      if (data.points != null) setMyPoints(data.points);
    }
  }

  async function handleSaveUsername(e: React.FormEvent) {
    e.preventDefault();
    setUsernameError("");
    const trimmed = desiredUsername.trim();
    if (trimmed.length < 3) {
      setUsernameError("Username must be at least 3 characters long.");
      return;
    }

    const { error } = await supabase.from("profiles").upsert({
      id: user.id,
      username: trimmed,
      points: 0,
      updated_at: new Date().toISOString(),
    });

    if (error) {
      if (error.code === "23505") {
        setUsernameError("This username is already taken. Please choose another.");
      } else {
        setUsernameError(error.message);
      }
    } else {
      setUsername(trimmed);
      setShowUsernameModal(false);
      setDesiredUsername("");
    }
  }

  async function fetchFavorites(userId: string) {
    const { data, error } = await supabase
      .from("favorites")
      .select("restaurant_id")
      .eq("user_id", userId);
    if (!error && data) {
      setFavorites(data.map((f: any) => f.restaurant_id));
    }
  }

  const handleAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError("");
    if (authMode === "SIGNIN") {
      const { error } = await supabase.auth.signInWithPassword({
        email: authEmail,
        password: authPassword,
      });
      if (error) setAuthError(error.message);
      else setShowAuthModal(false);
    } else {
      const { error } = await supabase.auth.signUp({
        email: authEmail,
        password: authPassword,
      });
      if (error) setAuthError(error.message);
      else {
        alert("Check your email for confirmation link or sign in now!");
        setAuthMode("SIGNIN");
      }
    }
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
  };

  const handleVerifyOwner = (e: React.FormEvent) => {
    e.preventDefault();
    setVerifyError("");
    const matched = restaurants.find(
      (r) => r.certificateNumber?.toLowerCase() === certInput.trim().toLowerCase()
    );

    if (matched) {
      setIsVerifiedOwner(true);
      setRole("OWNER");
      setActiveRestaurantId(matched.id);
      setShowOwnerVerifyModal(false);
      setCertInput("");
    } else {
      setVerifyError("Invalid HMC certificate reference. Please check and try again.");
    }
  };

  const toggleFavorite = async (restaurantId: number, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!user) {
      setShowAuthModal(true);
      return;
    }

    const isFav = favorites.includes(restaurantId);
    if (isFav) {
      const { error } = await supabase
        .from("favorites")
        .delete()
        .eq("user_id", user.id)
        .eq("restaurant_id", restaurantId);
      if (!error) setFavorites((prev) => prev.filter((id) => id !== restaurantId));
    } else {
      const { error } = await supabase
        .from("favorites")
        .insert({ user_id: user.id, restaurant_id: restaurantId });
      if (!error) setFavorites((prev) => [...prev, restaurantId]);
    }
  };

  useEffect(() => {
    async function fetchRestaurants() {
      const { data, error } = await supabase.from("restaurants").select("*");
      if (error) {
        console.error("Error fetching Supabase restaurants:", error.message);
      } else if (data && data.length > 0) {
        const formatted = data
          .filter((r) => r.name && r.name.trim() !== "" && r.lat != null && r.lng != null)
          .map((r) => ({
            ...r,
            halalCategory: r.halal_category || "HMC_CERTIFIED",
            servesAlcohol: r.serves_alcohol ?? false,
            certificateIssuer: r.certificate_issuer || "HMC (Halal Monitoring Committee UK)",
            certificateNumber: r.certificate_number || "HMC-UK-2026-PENDING",
            media: r.media || null,
            shortVideos: r.shortVideos || [],
            reviews: r.reviews || [],
          }));
        setRestaurants(formatted);
      }
    }

    fetchRestaurants();
    handleResetToCurrentLocation();
  }, []);

  useEffect(() => {
    let idealZoom = 14.2;
    if (maxDistanceMiles === 0.5) idealZoom = 14.2;
    else if (maxDistanceMiles === 1) idealZoom = 13.0;
    else if (maxDistanceMiles === 5) idealZoom = 10.8;

    setViewState((prev) => ({
      ...prev,
      zoom: idealZoom,
    }));
  }, [maxDistanceMiles, userLocation]);

  const activeRestaurant = restaurants.find((r) => r.id === activeRestaurantId) || null;

  const [editForm, setEditForm] = useState({
    shopFront: "",
    interior: "",
    food: "",
    menu: "",
    certIssuer: "",
    certNumber: "",
  });

  useEffect(() => {
    if (activeRestaurant) {
      setEditForm({
        shopFront: activeRestaurant.media?.SHOP_FRONT || "",
        interior: activeRestaurant.media?.INTERIOR || "",
        food: activeRestaurant.media?.FOOD || "",
        menu: activeRestaurant.media?.MENU || "",
        certIssuer: activeRestaurant.certificateIssuer || "",
        certNumber: activeRestaurant.certificateNumber || "",
      });
      setReviewError("");
    }
  }, [activeRestaurantId]);

  const handleResetToCurrentLocation = () => {
    if ("geolocation" in navigator) {
      setLocationStatus("Detecting GPS...");
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const lat = position.coords.latitude;
          const lng = position.coords.longitude;
          setUserLocation({ latitude: lat, longitude: lng });
          setViewState((prev) => ({
            ...prev,
            latitude: lat,
            longitude: lng,
            zoom: maxDistanceMiles === 0.5 ? 14.2 : maxDistanceMiles === 1 ? 13.0 : 10.8,
          }));
          setLocationStatus("Using your live GPS location");
          setSearchQuery("");
          setSuggestions([]);
        },
        () => {
          setLocationStatus("GPS unavailable. Showing London center.");
        },
        { timeout: 7000 }
      );
    }
  };

  const handleSearchInputChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setSearchQuery(val);
    if (val.trim().length < 2) {
      setSuggestions([]);
      return;
    }
    try {
      const [postcodeRes, nominatimRes] = await Promise.all([
        fetch(`https://api.postcodes.io/postcodes/${encodeURIComponent(val.trim())}/autocomplete`).catch(() => null),
        fetch(`https://nominatim.openstreetmap.org/search?format=json&countrycodes=gb&limit=4&q=${encodeURIComponent(val)}`).catch(() => null)
      ]);
      let newSuggestions: string[] = [];
      if (postcodeRes) {
        const pcData = await postcodeRes.json();
        if (pcData.status === 200 && pcData.result) newSuggestions = [...newSuggestions, ...pcData.result];
      }
      if (nominatimRes) {
        const nomData = await nominatimRes.json();
        if (Array.isArray(nomData)) {
          const placeNames = nomData.map((item: any) => item.display_name.split(",")[0]);
          newSuggestions = [...newSuggestions, ...placeNames];
        }
      }
      setSuggestions(Array.from(new Set(newSuggestions)).slice(0, 5));
    } catch (err) {}
  };

  const executeSearch = async (queryTerm: string) => {
    const query = queryTerm.trim();
    if (!query) return;
    setLocationStatus(`Searching area: ${query}...`);
    setSuggestions([]);

    try {
      const postcodeRes = await fetch(`https://api.postcodes.io/postcodes/${encodeURIComponent(query)}`);
      const postcodeData = await postcodeRes.json();
      if (postcodeData.status === 200 && postcodeData.result) {
        const { latitude, longitude, postcode, admin_district } = postcodeData.result;
        setUserLocation({ latitude, longitude });
        setViewState((prev) => ({ ...prev, latitude, longitude, zoom: 13 }));
        setLocationStatus(`Postcode: ${postcode} (${admin_district || "UK"})`);
        return;
      }

      const nominatimRes = await fetch(`https://nominatim.openstreetmap.org/search?format=json&countrycodes=gb&q=${encodeURIComponent(query)}`);
      const nominatimData = await nominatimRes.json();
      if (nominatimData && nominatimData.length > 0) {
        const { lat, lon, display_name } = nominatimData[0];
        const latitude = parseFloat(lat);
        const longitude = parseFloat(lon);
        setUserLocation({ latitude, longitude });
        setViewState((prev) => ({ ...prev, latitude, longitude, zoom: 13 }));
        setLocationStatus(`Area: ${display_name.split(",")[0]}`);
      } else {
        const found = restaurants.find(
          (r) => r.city.toLowerCase().includes(query.toLowerCase()) || r.postcode.toLowerCase().includes(query.toLowerCase())
        );
        if (found) {
          setUserLocation({ latitude: found.lat, longitude: found.lng });
          setViewState((prev) => ({ ...prev, latitude: found.lat, longitude: found.lng, zoom: 14 }));
          setActiveRestaurantId(found.id);
          setLocationStatus(`Found: ${found.city}`);
        } else {
          setLocationStatus("Location not found.");
        }
      }
    } catch (err) {
      setLocationStatus("Search failed.");
    }
  };

  const processedRestaurants = restaurants
    .map((rest) => {
      const distance = calculateDistanceMiles(userLocation.latitude, userLocation.longitude, rest.lat, rest.lng);
      return { ...rest, distance: parseFloat(distance.toFixed(1)) };
    })
    .sort((a, b) => a.distance - b.distance);

  const filteredRestaurants = processedRestaurants.filter((rest) => {
    if (selectedFilter === "FAVOURITES") {
      if (!user) return false;
      return favorites.includes(rest.id) && (maxDistanceMiles === 0 || rest.distance <= maxDistanceMiles);
    }
    const matchesCategory = selectedFilter === "ALL" ? true : rest.halalCategory === selectedFilter;
    const matchesDistance = maxDistanceMiles === 0 ? true : rest.distance <= maxDistanceMiles;
    return matchesCategory && matchesDistance;
  });

  const getCategoryBadge = (cat: string) => {
    switch (cat) {
      case "HMC_CERTIFIED":
        return { label: "HMC Certified", color: "bg-emerald-600 text-white" };
      case "HALAL_CERTIFIED":
        return { label: "Halal Certified", color: "bg-teal-600 text-white" };
      case "HALAL_OPTIONS":
        return { label: "Halal Options", color: "bg-sky-600 text-white" };
      default:
        return { label: cat, color: "bg-gray-600 text-white" };
    }
  };

  const radiusGeoJSON = createGeoJSONCircle(
    [userLocation.longitude, userLocation.latitude],
    maxDistanceMiles
  );

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

      {/* TOP HEADER */}
      <header className="sticky top-0 z-40 bg-slate-900/95 backdrop-blur border-b border-slate-800 px-4 py-3 shadow-md">
        <div className="max-w-6xl mx-auto flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="bg-gradient-to-r from-emerald-500 to-teal-400 text-slate-950 font-black px-3 py-1 rounded-xl text-sm tracking-tight shadow-sm">
              HALAL SCOUT UK
            </div>
            <span className="text-xs text-slate-400 hidden sm:inline">Waze-Style Discovery</span>
          </div>

          {/* MIDDLE: User / Owner Toggle */}
          {user && (
            <div className="flex bg-slate-800 p-1 rounded-xl border border-slate-700 text-xs shadow-inner">
              <button
                onClick={() => setRole("USER")}
                className={`flex items-center gap-1.5 px-3 py-1 rounded-lg font-medium transition ${
                  role === "USER" ? "bg-emerald-500 text-slate-950 font-bold shadow" : "text-slate-300 hover:text-white"
                }`}
              >
                <UserCheck className="w-3.5 h-3.5" /> User
              </button>
              <button
                onClick={() => {
                  if (isVerifiedOwner) {
                    setRole("OWNER");
                  } else {
                    setShowOwnerVerifyModal(true);
                  }
                }}
                className={`flex items-center gap-1.5 px-3 py-1 rounded-lg font-medium transition ${
                  role === "OWNER" ? "bg-amber-400 text-slate-950 font-bold shadow" : "text-slate-300 hover:text-white"
                }`}
              >
                <Store className="w-3.5 h-3.5" /> Owner {isVerifiedOwner ? "" : "🔒"}
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
                <Award className="w-4 h-4 text-amber-400 animate-pulse" />
                <div className="flex flex-col text-left">
                  <span className="font-bold text-white leading-tight">
                    {username ? `@${username}` : "Profile"} ({myPoints} pts)
                  </span>
                </div>
              </button>
            )}

            {user ? (
              <button
                onClick={handleSignOut}
                title="Sign Out"
                className="flex items-center gap-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 p-2 sm:px-3.5 sm:py-1.5 rounded-xl text-xs font-bold border border-slate-700 transition shadow"
              >
                <LogOut className="w-4 h-4 text-rose-400" />
                <span className="hidden sm:inline">Sign Out</span>
              </button>
            ) : (
              <button
                onClick={() => { setAuthMode("SIGNIN"); setShowAuthModal(true); }}
                className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-500 text-white px-3.5 py-1.5 rounded-xl text-xs font-bold transition shadow"
              >
                <LogIn className="w-3.5 h-3.5" /> Sign In / Up
              </button>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 pt-6 space-y-6">
        {/* MAPBOX CONTAINER & SEARCH RADAR */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-2xl">
          <div className="p-3 bg-slate-900/95 border-b border-slate-800 flex flex-wrap items-center justify-between gap-3 text-xs font-semibold text-slate-300">
            <span className="flex items-center gap-1.5 text-emerald-400">
              <Navigation className="w-4 h-4" /> Radar: {locationStatus}
            </span>

            <div className="flex items-center gap-2">
              <form onSubmit={(e) => { e.preventDefault(); executeSearch(searchQuery); }} className="flex gap-2">
                <div className="relative">
                  <Search className="absolute left-2.5 top-2 w-3.5 h-3.5 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Search town, area or postcode..."
                    value={searchQuery}
                    onChange={handleSearchInputChange}
                    className="bg-slate-950 border border-slate-700 rounded-xl pl-8 pr-3 py-1.5 text-xs text-white focus:outline-none focus:border-emerald-500 w-52 sm:w-64 shadow-inner"
                  />
                  {suggestions.length > 0 && (
                    <div className="absolute left-0 right-0 top-full mt-1.5 bg-slate-900 border border-slate-700 rounded-xl shadow-2xl z-50 overflow-hidden">
                      {suggestions.map((item, idx) => (
                        <div
                          key={idx}
                          onClick={() => {
                            setSearchQuery(item);
                            setSuggestions([]);
                            executeSearch(item);
                          }}
                          className="px-3 py-2 text-xs text-slate-300 hover:bg-slate-800 hover:text-white cursor-pointer border-b border-slate-800 last:border-none flex items-center gap-2"
                        >
                          <MapPin className="w-3 h-3 text-emerald-400" /> {item}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <button type="submit" className="bg-emerald-600 hover:bg-emerald-500 text-white px-3.5 py-1.5 rounded-xl font-bold shadow transition">
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
              style={{ width: "100%", height: "100%", position: "absolute", top: 0, left: 0 }}
              mapStyle="mapbox://styles/mapbox/dark-v11"
              mapboxAccessToken={process.env.NEXT_PUBLIC_MAPBOX_TOKEN}
            >
              <Source id="radius-source" type="geojson" data={radiusGeoJSON}>
                <Layer
                  id="radius-fill"
                  type="fill"
                  paint={{
                    "fill-color": "#10b981",
                    "fill-opacity": 0.08,
                  }}
                />
                <Layer
                  id="radius-border"
                  type="line"
                  paint={{
                    "line-color": "#10b981",
                    "line-width": 2,
                    "line-dasharray": [2, 2],
                  }}
                />
              </Source>

              <Marker latitude={userLocation.latitude} longitude={userLocation.longitude} anchor="center">
                <div className="relative flex items-center justify-center">
                  <span className="absolute w-5 h-5 bg-sky-400/40 rounded-full animate-ping"></span>
                  <div className="w-2.5 h-2.5 bg-sky-500 rounded-full border border-white shadow-md"></div>
                </div>
              </Marker>

              {filteredRestaurants.map((rest) => {
                const isSelected = activeRestaurantId === rest.id;
                const avgRating = getAverageRating(rest.reviews);
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
                          ? "w-4 h-4 bg-amber-400 border-2 border-white scale-125 z-30 shadow-amber-400/60"
                          : "w-3 h-3 bg-emerald-500 hover:bg-emerald-400 border border-white/90 hover:scale-125"
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
                    <div className="w-7 h-7 rounded-full bg-amber-400/20 border border-amber-400/40 text-amber-300 flex items-center justify-center font-bold text-xs shadow-inner">
                      <Star className="w-3.5 h-3.5 fill-current text-amber-400 mr-0.5" />
                      {getAverageRating(activeRestaurant.reviews) || "New"}
                    </div>
                    <span className="font-bold text-xs text-white tracking-tight">{activeRestaurant.name}</span>
                  </div>
                </Popup>
              )}
            </Map>
          </div>
        </div>

        {/* STICKY QUICK-FILTER PILL BAR */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-lg space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-300">Radius Filter:</span>
              <div className="flex bg-slate-800 p-1 rounded-xl text-xs gap-1 border border-slate-700">
                {[
                  { label: "0.5 mi (Local)", val: 0.5 },
                  { label: "1 mi", val: 1 },
                  { label: "5 mi", val: 5 },
                ].map((item) => (
                  <button
                    key={item.val}
                    onClick={() => setMaxDistanceMiles(item.val)}
                    className={`px-3 py-1 rounded-lg font-semibold transition ${
                      maxDistanceMiles === item.val ? "bg-emerald-500 text-slate-950 shadow" : "text-slate-400 hover:text-white"
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex flex-wrap gap-1.5 text-xs">
              {[
                { id: "ALL", label: "All Categories" },
                { id: "HMC_CERTIFIED", label: "HMC Certified" },
                ...(user ? [{ id: "FAVOURITES", label: `❤️ Saved (${favorites.length})` }] : []),
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setSelectedFilter(tab.id)}
                  className={`px-3 py-1.5 rounded-xl font-medium border transition ${
                    selectedFilter === tab.id
                      ? "bg-emerald-500/20 border-emerald-500 text-emerald-300 shadow"
                      : "bg-slate-800/80 border-slate-700 text-slate-400 hover:bg-slate-800 hover:text-white"
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* MAIN SPLIT LAYOUT */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* LEFT: RESTAURANT CARDS LIST */}
          <section className="lg:col-span-5 space-y-3">
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400 px-1">
              Nearby Spots ({filteredRestaurants.length} found)
            </h2>

            {filteredRestaurants.length === 0 ? (
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 text-center text-xs text-slate-400">
                {selectedFilter === "FAVOURITES" 
                  ? "You haven't saved any favorite restaurants yet."
                  : `No restaurants found within ${maxDistanceMiles} miles of this location.`}
              </div>
            ) : (
              filteredRestaurants.map((rest) => {
                const badge = getCategoryBadge(rest.halalCategory);
                const isSelected = activeRestaurantId === rest.id;
                const isFav = favorites.includes(rest.id);
                const avgRating = getAverageRating(rest.reviews);
                return (
                  <div
                    key={rest.id}
                    onClick={() => {
                      setActiveRestaurantId(rest.id);
                      setViewState((prev) => ({
                        ...prev,
                        latitude: rest.lat,
                        longitude: rest.lng,
                        zoom: 15,
                      }));
                    }}
                    className={`cursor-pointer rounded-2xl p-4 border transition transform hover:-translate-y-0.5 shadow-xl relative ${
                      isSelected
                        ? "bg-slate-900 border-emerald-500 ring-2 ring-emerald-500/40 shadow-emerald-500/10"
                        : "bg-slate-900/70 border-slate-800 hover:border-slate-700"
                    }`}
                  >
                    {user && (
                      <button
                        onClick={(e) => toggleFavorite(rest.id, e)}
                        title={isFav ? "Remove from Favorites" : "Save to Favorites"}
                        className="absolute top-4 right-4 p-2 rounded-full bg-slate-800 hover:bg-slate-700 border border-slate-700 transition shadow"
                      >
                        <Heart className={`w-4 h-4 ${isFav ? "text-rose-500 fill-rose-500" : "text-slate-400 hover:text-white"}`} />
                      </button>
                    )}

                    <div className="flex flex-wrap items-center justify-between gap-2 pr-10">
                      <div className="flex items-center gap-2">
                        <h3 className="font-bold text-base text-white">{rest.name}</h3>
                        {avgRating ? (
                          <span className="flex items-center gap-1 bg-amber-400/20 text-amber-300 text-xs font-bold px-2 py-0.5 rounded border border-amber-400/40">
                            <Star className="w-3 h-3 fill-current" /> {avgRating} ({rest.reviews.length})
                          </span>
                        ) : (
                          <span className="text-[10px] bg-slate-800 text-slate-400 px-2 py-0.5 rounded border border-slate-700">
                            No reviews yet
                          </span>
                        )}
                      </div>
                      <span className="text-emerald-400 font-bold font-mono text-xs bg-emerald-500/10 px-2 py-0.5 rounded-lg border border-emerald-500/30">
                        📍 {rest.distance} miles
                      </span>
                    </div>

                    <div className="flex items-center justify-between text-xs text-slate-400 mt-1">
                      <span>{rest.city}, {rest.postcode}</span>
                      {rest.servesAlcohol && (
                        <span className="inline-flex items-center gap-1 bg-amber-400/20 text-amber-300 text-[10px] font-bold px-2 py-0.5 rounded border border-amber-400/40">
                          <AlertTriangle className="w-3 h-3" /> Alcohol Served
                        </span>
                      )}
                    </div>

                    <div className="mt-3 flex items-center justify-between">
                      <span className={`text-[11px] font-bold px-3 py-1 rounded-xl shadow-sm ${badge.color}`}>
                        {badge.label}
                      </span>
                      <span className="text-xs text-slate-400 flex items-center gap-1 font-medium hover:text-white">
                        {isSelected ? "Selected" : "Select"} <ChevronRight className="w-3.5 h-3.5 text-emerald-400" />
                      </span>
                    </div>
                  </div>
                );
              })
            )}
          </section>

          {/* RIGHT: DETAILED RESTAURANT PROFILE OR EMPTY STATE */}
          <section className="lg:col-span-7 space-y-6">
            {activeRestaurant ? (
              <>
                <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-5 shadow-2xl">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="space-y-1.5">
                      <div className="flex flex-wrap items-center gap-2.5">
                        <h1 className="text-2xl font-black text-white">
                          {activeRestaurant.name}
                        </h1>
                        {getAverageRating(activeRestaurant.reviews) ? (
                          <span className="flex items-center gap-1 bg-amber-400/20 text-amber-300 text-xs font-bold px-2.5 py-1 rounded-lg border border-amber-400/40 shadow">
                            <Star className="w-3.5 h-3.5 fill-current" /> {getAverageRating(activeRestaurant.reviews)} ({activeRestaurant.reviews.length} user reviews)
                          </span>
                        ) : (
                          <span className="text-xs bg-slate-800 text-slate-400 px-2.5 py-1 rounded-lg border border-slate-700">
                            No community ratings yet
                          </span>
                        )}
                        {user && (
                          <button
                            onClick={(e) => toggleFavorite(activeRestaurant.id, e)}
                            className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 transition shadow"
                          >
                            <Heart className={`w-4 h-4 ${favorites.includes(activeRestaurant.id) ? "text-rose-500 fill-rose-500" : "text-slate-400"}`} />
                          </button>
                        )}
                      </div>
                      <p className="text-sm text-slate-400 flex items-center gap-1.5">
                        <MapPin className="w-4 h-4 text-emerald-400" />
                        {activeRestaurant.city}, {activeRestaurant.postcode}, UK
                      </p>
                    </div>

                    <button
                      onClick={() => setShowCertModal(true)}
                      className="flex items-center gap-2 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 px-4 py-2 rounded-xl text-xs font-bold transition shadow"
                    >
                      <ShieldCheck className="w-4 h-4 text-emerald-400" />
                      View Halal Certificate
                    </button>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-2">
                    <a
                      href={`https://www.google.com/maps/dir/?api=1&destination=${activeRestaurant.lat},${activeRestaurant.lng}`}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center justify-center gap-2 bg-slate-800 hover:bg-slate-700 text-white py-2.5 px-4 rounded-xl text-xs font-semibold border border-slate-700 transition shadow"
                    >
                      <MapPin className="w-4 h-4 text-emerald-400" /> Get Directions
                    </a>
                    
                    {activeRestaurant.website && activeRestaurant.website.trim() !== "" && activeRestaurant.website !== "#" && (
                      <a
                        href={activeRestaurant.website}
                        target="_blank"
                        rel="noreferrer"
                        className="flex items-center justify-center gap-2 bg-slate-800 hover:bg-slate-700 text-white py-2.5 px-4 rounded-xl text-xs font-semibold border border-slate-700 transition shadow"
                      >
                        <Globe className="w-4 h-4 text-sky-400" /> Book on Website
                      </a>
                    )}

                    {activeRestaurant.phone && (
                      <a
                        href={`tel:${activeRestaurant.phone}`}
                        className="flex items-center justify-center gap-2 bg-slate-800 hover:bg-slate-700 text-white py-2.5 px-4 rounded-xl text-xs font-semibold border border-slate-700 transition shadow"
                      >
                        <Phone className="w-4 h-4 text-amber-400" /> {activeRestaurant.phone}
                      </a>
                    )}
                  </div>

                  {role === "OWNER" || isTrustedScoutOrPrivileged ? (
                    <div className="mt-4 p-4 rounded-xl bg-amber-500/10 border border-amber-400/40 space-y-3 shadow-inner">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold uppercase tracking-wider text-amber-300 flex items-center gap-1.5">
                          <Store className="w-4 h-4" /> Trusted Scout / Owner Media Uploads
                        </span>
                        <span className="text-[11px] text-amber-200/80">Unlocked via Status</span>
                      </div>
                      <button
                        onClick={() => setShowOwnerModal(true)}
                        className="flex items-center gap-1.5 bg-amber-400 hover:bg-amber-300 text-slate-950 font-extrabold px-3.5 py-1.5 rounded-lg transition shadow text-xs"
                      >
                        <Upload className="w-3.5 h-3.5" /> Manage Photos & Certificate
                      </button>
                    </div>
                  ) : (
                    <div className="mt-4 p-3 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-between text-xs text-slate-400">
                      <span className="flex items-center gap-1.5">
                        <Lock className="w-4 h-4 text-slate-500" /> Photo Uploads Locked
                      </span>
                      <span className="text-[11px] text-emerald-400 font-semibold">Reach 1,000 thumbs up to unlock Trusted Scout status</span>
                    </div>
                  )}
                </div>

                {/* GALLERY SECTION */}
                <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4 shadow-2xl">
                  <h2 className="text-base font-bold text-white flex items-center gap-2">
                    <ImageIcon className="w-4 h-4 text-emerald-400" /> Gallery & Atmosphere
                  </h2>
                  <div className="relative h-64 w-full overflow-hidden rounded-xl border border-slate-800 shadow-inner bg-slate-950 flex items-center justify-center">
                    {activeRestaurant.media?.[mediaTab] ? (
                      <img
                        src={activeRestaurant.media[mediaTab]}
                        alt={mediaTab}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="flex flex-col items-center justify-center text-slate-500 space-y-2">
                        <ImageIcon className="w-8 h-8 opacity-40" />
                        <span className="text-xs font-semibold tracking-wide">No images posted yet</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* USER REVIEWS & 6-MONTH COOL-DOWN RATING SUBMISSION */}
                <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-5 shadow-2xl">
                  <h2 className="text-base font-bold text-white">Community Reviews & Ratings</h2>

                  {reviewError && (
                    <div className="bg-amber-950/40 border border-amber-500/40 text-amber-300 text-xs p-3 rounded-xl flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4 shrink-0 text-amber-400" />
                      <span>{reviewError}</span>
                    </div>
                  )}

                  {user && (
                    <form onSubmit={async (e) => {
                      e.preventDefault();
                      setReviewError("");
                      if (!newReviewText.trim()) return;

                      const userPastReviews = activeRestaurant.reviews.filter(
                        (r: any) => r.user_id === user.id || r.userName === username
                      );

                      if (userPastReviews.length > 0) {
                        const latestReview = userPastReviews.reduce((latest: any, current: any) => 
                          (current.created_at || current.id) > (latest.created_at || latest.id) ? current : latest
                        );

                        const reviewTime = new Date(latestReview.created_at || latestReview.id).getTime();
                        const sixMonthsInMs = 6 * 30 * 24 * 60 * 60 * 1000;
                        const now = Date.now();

                        if (now - reviewTime < sixMonthsInMs) {
                          const monthsLeft = Math.ceil((sixMonthsInMs - (now - reviewTime)) / (30 * 24 * 60 * 60 * 1000));
                          setReviewError(`You must wait at least 6 months between reviews for the same restaurant. You can review this spot again in about ${monthsLeft} month(s).`);
                          return;
                        }
                      }

                      const { data, error } = await supabase.from("reviews").insert({
                        restaurant_id: activeRestaurant.id,
                        user_id: user.id,
                        user_name: username || "ScoutUser",
                        rating: newReviewRating,
                        comment: newReviewText,
                        created_at: new Date().toISOString(),
                      }).select();

                      if (error) {
                        console.error("Error posting review:", error.message);
                        setReviewError("Failed to post review. Please try again.");
                        return;
                      }

                      const newRev = data ? data[0] : {
                        id: Date.now(),
                        user_id: user.id,
                        userName: username || "ScoutUser",
                        userLevel: "Verified Scout",
                        rating: newReviewRating,
                        comment: newReviewText,
                        thumbsUp: 0,
                        created_at: new Date().toISOString(),
                      };

                      setRestaurants((prev) =>
                        prev.map((rest) =>
                          rest.id === activeRestaurant.id 
                            ? { ...rest, reviews: [newRev, ...rest.reviews] } 
                            : rest
                        )
                      );
                      setNewReviewText("");
                      setMyPoints((pts) => pts + 50);
                    }} className="space-y-3 bg-slate-800/60 p-4 rounded-xl border border-slate-800 shadow-inner">
                      <div className="flex items-center justify-between">
                        <label className="text-xs font-bold text-emerald-400 flex items-center gap-1.5">
                          <CheckCircle2 className="w-3.5 h-3.5" /> Post a New Review as @{username}
                        </label>
                        <div className="flex items-center gap-1">
                          {[1, 2, 3, 4, 5].map((star) => (
                            <button
                              type="button"
                              key={star}
                              onClick={() => setNewReviewRating(star)}
                              className="text-xs focus:outline-none"
                            >
                              <Star className={`w-4 h-4 ${star <= newReviewRating ? "text-amber-400 fill-amber-400" : "text-slate-600"}`} />
                            </button>
                          ))}
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={newReviewText}
                          onChange={(e) => setNewReviewText(e.target.value)}
                          placeholder="How was your latest experience here?"
                          className="flex-1 bg-slate-900 border border-slate-700 rounded-xl px-3.5 py-2 text-xs text-white shadow-inner"
                        />
                        <button
                          type="submit"
                          className="bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold px-4 py-2 rounded-xl text-xs shadow transition"
                        >
                          Submit
                        </button>
                      </div>
                    </form>
                  )}

                  <div className="space-y-4">
                    {activeRestaurant.reviews && activeRestaurant.reviews.length > 0 ? (
                      activeRestaurant.reviews.map((rev: any) => (
                        <div key={rev.id || rev.created_at} className="p-4 rounded-xl bg-slate-800/40 border border-slate-800 space-y-2">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-sm text-white">@{rev.userName || rev.user_name}</span>
                              <span className="flex items-center gap-1 bg-amber-400/20 text-amber-300 text-[10px] font-bold px-2 py-0.5 rounded border border-amber-400/40">
                                <Star className="w-3 h-3 fill-current" /> {rev.rating} / 5
                              </span>
                            </div>
                            <span className="text-xs text-slate-400 flex items-center gap-1">
                              <ThumbsUp className="w-3 h-3 text-emerald-400" /> {rev.thumbsUp || 0}
                            </span>
                          </div>
                          <p className="text-xs text-slate-200">{rev.comment}</p>
                        </div>
                      ))
                    ) : (
                      <div className="text-center py-6 text-xs text-slate-500">
                        No user reviews yet. Be the first scout to rate this restaurant!
                      </div>
                    )}
                  </div>
                </div>
              </>
            ) : (
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-12 text-center flex flex-col items-center justify-center space-y-3 shadow-2xl">
                <div className="w-12 h-12 rounded-full bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
                  <MapPin className="w-6 h-6 animate-bounce" />
                </div>
                <h3 className="text-base font-bold text-white">No Restaurant Selected</h3>
                <p className="text-xs text-slate-400 max-w-sm">
                  Click on any pin on the map or select a spot from the nearby list to view full certification details.
                </p>
              </div>
            )}
          </section>
        </div>
      </main>

      {/* PRIVATE USER PROFILE MODAL */}
      {showProfileModal && user && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-lg w-full p-6 space-y-5 shadow-2xl overflow-y-auto max-h-[90vh]">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="font-bold text-base text-white flex items-center gap-2">
                <User className="w-5 h-5 text-emerald-400" /> Private Scout Profile
              </h3>
              <button onClick={() => setShowProfileModal(false)} className="text-slate-400 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex items-center gap-4 bg-slate-800/60 p-4 rounded-xl border border-slate-800 shadow-inner">
              <div className="w-12 h-12 rounded-full bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 flex items-center justify-center font-black text-lg">
                {username ? username[0].toUpperCase() : "S"}
              </div>
              <div className="space-y-0.5 flex-1">
                <h4 className="font-bold text-white text-base">@{username || "scout"}</h4>
                <p className="text-xs text-slate-400">{user.email}</p>
                <div className="flex items-center justify-between pt-1">
                  <span className="text-[10px] bg-amber-400/20 text-amber-300 font-bold px-2 py-0.5 rounded border border-amber-400/40">
                    {myTotalThumbsUp >= 1000 ? "⭐ Trusted Scout" : "🥇 Gold Scout"}
                  </span>
                  <span className="text-[10px] text-emerald-400 font-mono font-bold">
                    Rank #4 in UK
                  </span>
                </div>
              </div>
            </div>

            {/* Tier Progress Bar */}
            <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800 space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-300 font-semibold flex items-center gap-1.5">
                  <Trophy className="w-3.5 h-3.5 text-amber-400" /> Progress to Trusted Scout (1,000 pts)
                </span>
                <span className="text-emerald-400 font-mono font-bold">{myPoints} / 1000 pts</span>
              </div>
              <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden">
                <div 
                  className="bg-gradient-to-r from-emerald-500 to-teal-400 h-full rounded-full transition-all duration-500"
                  style={{ width: `${Math.min(100, (myPoints / 1000) * 100)}%` }}
                ></div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 text-center">
              <div className="bg-slate-950 p-3 rounded-xl border border-slate-800">
                <span className="text-xs text-slate-400 block">Total Points</span>
                <span className="text-lg font-black text-emerald-400">{myPoints} pts</span>
              </div>
              <div className="bg-slate-950 p-3 rounded-xl border border-slate-800">
                <span className="text-xs text-slate-400 block">Saved Favorites</span>
                <span className="text-lg font-black text-rose-400">{favorites.length} spots</span>
              </div>
            </div>

            {/* Halal Passport / Stamp Book */}
            <div className="space-y-2 pt-1">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                <Compass className="w-3.5 h-3.5 text-emerald-400" /> Digital Halal Passport (Stamps)
              </h4>
              <div className="grid grid-cols-3 gap-2">
                <div className="bg-slate-950 p-2.5 rounded-xl border border-emerald-500/30 text-center space-y-0.5">
                  <span className="text-base">🇬🇧</span>
                  <p className="text-[11px] font-bold text-white">London Scout</p>
                  <span className="text-[9px] text-emerald-400 font-mono">Unlocked</span>
                </div>
                <div className="bg-slate-950 p-2.5 rounded-xl border border-slate-800 text-center space-y-0.5 opacity-60">
                  <span className="text-base">🏛️</span>
                  <p className="text-[11px] font-bold text-slate-400">Birmingham</p>
                  <span className="text-[9px] text-slate-500 font-mono">0 / 3 Reviews</span>
                </div>
                <div className="bg-slate-950 p-2.5 rounded-xl border border-slate-800 text-center space-y-0.5 opacity-60">
                  <span className="text-base">🏰</span>
                  <p className="text-[11px] font-bold text-slate-400">Manchester</p>
                  <span className="text-[9px] text-slate-500 font-mono">0 / 3 Reviews</span>
                </div>
              </div>
            </div>

            {/* Bookmarked Favorites List */}
            <div className="space-y-2 pt-1">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                <Bookmark className="w-3.5 h-3.5 text-emerald-400" /> Bookmarked Favorites ({favorites.length})
              </h4>
              <div className="max-h-28 overflow-y-auto space-y-1.5">
                {favorites.length > 0 ? (
                  favorites.map((favId) => {
                    const r = restaurants.find((item) => item.id === favId);
                    if (!r) return null;
                    return (
                      <div key={favId} className="bg-slate-950 px-3 py-2 rounded-lg text-xs text-slate-300 flex items-center justify-between border border-slate-800/80">
                        <span className="font-semibold text-white">{r.name}</span>
                        <span className="text-slate-400">{r.city}</span>
                      </div>
                    );
                  })
                ) : (
                  <p className="text-xs text-slate-500 text-center py-3">No saved favorites yet.</p>
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

      {/* AUTHENTICATION MODAL (EMAIL) */}
      {showAuthModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-sm w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="font-bold text-base text-white flex items-center gap-2">
                <LogIn className="w-4 h-4 text-emerald-400" /> {authMode === "SIGNIN" ? "Sign In to Halal Scout" : "Create Scout Account"}
              </h3>
              <button onClick={() => setShowAuthModal(false)} className="text-slate-400 hover:text-white">
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
                <label className="text-slate-400 font-medium">Email Address:</label>
                <input
                  type="email"
                  required
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
                {authMode === "SIGNIN" ? "Sign In" : "Sign Up"}
              </button>
            </form>

            <div className="text-center pt-2">
              <button
                onClick={() => setAuthMode(authMode === "SIGNIN" ? "SIGNUP" : "SIGNIN")}
                className="text-xs text-emerald-400 hover:underline"
              >
                {authMode === "SIGNIN" ? "Don't have an account? Sign up" : "Already have an account? Sign in"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MANUAL USERNAME SELECTION MODAL */}
      {showUsernameModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/90 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-emerald-500/50 rounded-2xl max-w-sm w-full p-6 space-y-4 shadow-2xl">
            <div className="border-b border-slate-800 pb-3">
              <h3 className="font-bold text-base text-emerald-400 flex items-center gap-2">
                <User className="w-5 h-5 text-emerald-400" /> Choose Your Scout Username
              </h3>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed">
              Welcome to Halal Scout! Please pick a unique handle that will appear on your reviews and leaderboard profile.
            </p>

            {usernameError && (
              <div className="bg-rose-950/40 border border-rose-500/40 text-rose-300 text-xs p-2.5 rounded-lg">
                {usernameError}
              </div>
            )}

            <form onSubmit={handleSaveUsername} className="space-y-3 text-xs">
              <div>
                <label className="text-slate-400 font-medium">Username Handle:</label>
                <div className="relative mt-1">
                  <span className="absolute left-3 top-2.5 text-slate-500 font-mono">@</span>
                  <input
                    type="text"
                    required
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

      {/* OWNER VERIFICATION MODAL */}
      {showOwnerVerifyModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-amber-500/40 rounded-2xl max-w-sm w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="font-bold text-base text-amber-300 flex items-center gap-2">
                <KeyRound className="w-4 h-4 text-amber-400" /> Verify Restaurant Ownership
              </h3>
              <button onClick={() => setShowOwnerVerifyModal(false)} className="text-slate-400 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed">
              To unlock the Owner Dashboard, please enter your registered HMC certificate reference number (e.g. <span className="font-mono text-amber-300">HMC-UK-2026-8841</span>).
            </p>

            {verifyError && (
              <div className="bg-rose-950/40 border border-rose-500/40 text-rose-300 text-xs p-2.5 rounded-lg">
                {verifyError}
              </div>
            )}

            <form onSubmit={handleVerifyOwner} className="space-y-3 text-xs">
              <div>
                <label className="text-slate-400 font-medium">HMC Certificate Number:</label>
                <input
                  type="text"
                  required
                  value={certInput}
                  onChange={(e) => setCertInput(e.target.value)}
                  placeholder="HMC-UK-..."
                  className="w-full mt-1 bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white font-mono"
                />
              </div>

              <button
                type="submit"
                className="w-full mt-2 bg-amber-400 hover:bg-amber-300 text-slate-950 font-extrabold py-2.5 rounded-lg transition shadow"
              >
                Verify & Unlock Owner Mode
              </button>
            </form>
          </div>
        </div>
      )}

      {/* CERTIFICATE MODAL */}
      {showCertModal && activeRestaurant && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-base text-white flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-emerald-400" /> Verified Halal Certificate
              </h3>
              <button onClick={() => setShowCertModal(false)} className="text-xs text-slate-400 hover:text-white">
                Close ✕
              </button>
            </div>
            <div className="bg-slate-950 border border-emerald-500/30 rounded-xl p-4 space-y-2 text-xs shadow-inner">
              <p className="text-slate-400">Restaurant Name:</p>
              <p className="font-bold text-white text-sm">{activeRestaurant.name}</p>
              <p className="text-slate-400 pt-2">Certifying Body:</p>
              <p className="font-semibold text-emerald-400">{activeRestaurant.certificateIssuer}</p>
              <p className="text-slate-400 pt-2">Certificate Reference:</p>
              <p className="font-mono text-white">{activeRestaurant.certificateNumber}</p>
            </div>
          </div>
        </div>
      )}

      {/* OWNER EDIT MODAL */}
      {showOwnerModal && activeRestaurant && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-lg w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="font-bold text-base text-white flex items-center gap-2">
                <Store className="w-5 h-5 text-amber-400" /> Media & Verification Portal
              </h3>
              <button onClick={() => setShowOwnerModal(false)} className="text-xs text-slate-400 hover:text-white">
                Close ✕
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="text-slate-400 font-medium">Shop Front Image URL:</label>
                <input
                  type="text"
                  value={editForm.shopFront}
                  onChange={(e) => setEditForm({ ...editForm, shopFront: e.target.value })}
                  placeholder="https://..."
                  className="w-full mt-1 bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white"
                />
              </div>
              <div>
                <label className="text-slate-400 font-medium">Food Shot Image URL:</label>
                <input
                  type="text"
                  value={editForm.food}
                  onChange={(e) => setEditForm({ ...editForm, food: e.target.value })}
                  placeholder="https://..."
                  className="w-full mt-1 bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-slate-800">
              <button
                onClick={() => setShowOwnerModal(false)}
                className="px-4 py-2 rounded-lg bg-slate-800 text-slate-300 text-xs font-semibold hover:bg-slate-700"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  setRestaurants((prev) =>
                    prev.map((r: any) =>
                      r.id === activeRestaurant.id
                        ? {
                            ...r,
                            media: {
                              ...r.media,
                              SHOP_FRONT: editForm.shopFront,
                              FOOD: editForm.food,
                            },
                          }
                        : r
                    )
                  );
                  setShowOwnerModal(false);
                }}
                className="px-4 py-2 rounded-lg bg-amber-400 text-slate-950 text-xs font-bold hover:bg-amber-300 shadow"
              >
                Save Media
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
