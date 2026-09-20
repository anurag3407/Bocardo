import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Image,
  StyleSheet,
  SafeAreaView,
  TextInput,
} from 'react-native';
import { useRouter } from 'expo-router';
import { formatPaiseToRupees, MealSlot, FoodType } from '@bocardo/shared-types';
import { cartStore } from '../lib/cart';
import { FssaiBadge } from '../components/FssaiBadge';
import { trpc } from '../lib/api';

interface Restaurant {
  id: string;
  name: string;
  rating: number;
  deliveryTime: string;
  deliveryMinutes: number;
  cuisine: string[];
  distanceKm: string;
  imageUrl: string;
  isAcceptingOrders: boolean;
  isPureVeg: boolean;
  offerText?: string;
}

export interface RecommendationDish {
  id: string;
  name: string;
  description?: string;
  pricePaise: number;
  imageUrl?: string;
  isVeg: boolean;
  restaurantId: string;
  restaurantName: string;
  category?: string;
  distanceMeters?: number;
}

const FALLBACK_TRENDING: RecommendationDish[] = [
  {
    id: 'dish-1-uuid',
    name: 'Hyderabadi Dum Biryani',
    pricePaise: 32000,
    imageUrl: 'https://images.unsplash.com/photo-1563379091339-03b21ab4a4f8?w=400',
    isVeg: false,
    restaurantId: 'rest-1-uuid',
    restaurantName: 'Biryani Bliss',
    distanceMeters: 1200,
  },
  {
    id: 'dish-2-uuid',
    name: 'Crispy Ghee Podi Dosa',
    pricePaise: 14000,
    imageUrl: 'https://images.unsplash.com/photo-1610192244261-3f33de3f55e4?w=400',
    isVeg: true,
    restaurantId: 'rest-2-uuid',
    restaurantName: 'South Kitchen',
    distanceMeters: 2100,
  },
];

const DEMO_RESTAURANTS: Restaurant[] = [
  {
    id: 'rest-1-uuid',
    name: 'Biryani Bliss & Kebabs',
    rating: 4.6,
    deliveryTime: '25-30 mins',
    deliveryMinutes: 28,
    cuisine: ['Biryani', 'Mughlai', 'Kebabs'],
    distanceKm: '1.2 km',
    imageUrl: 'https://images.unsplash.com/photo-1563379091339-03b21ab4a4f8?w=800',
    isAcceptingOrders: true,
    isPureVeg: false,
    offerText: '₹100 OFF ABOVE ₹399',
  },
  {
    id: 'rest-2-uuid',
    name: 'South Kitchen Pure Veg Tiffin',
    rating: 4.5,
    deliveryTime: '20-25 mins',
    deliveryMinutes: 22,
    cuisine: ['South Indian', 'Breakfast', 'Dosa'],
    distanceKm: '2.1 km',
    imageUrl: 'https://images.unsplash.com/photo-1610192244261-3f33de3f55e4?w=800',
    isAcceptingOrders: true,
    isPureVeg: true,
    offerText: 'FLAT ₹50 OFF',
  },
  {
    id: 'rest-3-uuid',
    name: 'The Burger Barn & Shakes',
    rating: 4.3,
    deliveryTime: '30-35 mins',
    deliveryMinutes: 32,
    cuisine: ['Burgers', 'American', 'Wings'],
    distanceKm: '3.4 km',
    imageUrl: 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=800',
    isAcceptingOrders: true,
    isPureVeg: false,
  },
  {
    id: 'rest-4-uuid',
    name: 'Shree Krishna Sagar Pure Veg',
    rating: 4.4,
    deliveryTime: '15-20 mins',
    deliveryMinutes: 18,
    cuisine: ['North Indian', 'Chinese', 'Thali'],
    distanceKm: '1.5 km',
    imageUrl: 'https://images.unsplash.com/photo-1585937421612-70a008356fbe?w=800',
    isAcceptingOrders: true,
    isPureVeg: true,
    offerText: '20% OFF UP TO ₹120',
  },
  {
    id: 'rest-5-uuid',
    name: 'Punjab Grill House',
    rating: 3.9,
    deliveryTime: '35-40 mins',
    deliveryMinutes: 38,
    cuisine: ['North Indian', 'Tandoor', 'Biryani'],
    distanceKm: '4.2 km',
    imageUrl: 'https://images.unsplash.com/photo-1603894584373-5ac82b2ae398?w=800',
    isAcceptingOrders: true,
    isPureVeg: false,
    offerText: 'FREE DESSERT ON ₹499',
  },
];

const MEAL_SLOTS = [
  { id: MealSlot.BREAKFAST, label: '🥞 Breakfast', time: '6-11 AM' },
  { id: MealSlot.LUNCH, label: '🍛 Lunch', time: '11-4 PM' },
  { id: MealSlot.SNACKS, label: '☕ Snacks', time: '4-7 PM' },
  { id: MealSlot.DINNER, label: '🍲 Dinner', time: '7-11 PM' },
  { id: MealSlot.LATE_NIGHT, label: '🌙 Late Night', time: '11-6 AM' },
];

export default function HomeScreen() {
  const router = useRouter();

  // Filters state
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSlot, setSelectedSlot] = useState<MealSlot>(MealSlot.LUNCH);
  const [pureVegOnly, setPureVegOnly] = useState(false);
  const [rating4Plus, setRating4Plus] = useState(false);
  const [fastDelivery, setFastDelivery] = useState(false);
  const [offersOnly, setOffersOnly] = useState(false);

  // Cart state
  const [cartCount, setCartCount] = useState(0);
  const [cartSubtotal, setCartSubtotal] = useState(0);

  // Recommendations state
  const [trendingDishes, setTrendingDishes] = useState<RecommendationDish[]>(FALLBACK_TRENDING);
  const [slotDishes, setSlotDishes] = useState<RecommendationDish[]>([]);

  useEffect(() => {
    const updateCart = () => {
      const items = cartStore.getItems();
      setCartCount(items.reduce((acc, i) => acc + i.quantity, 0));
      setCartSubtotal(cartStore.getSubtotalPaise());
    };
    updateCart();
    return cartStore.subscribe(updateCart);
  }, []);

  // Fetch Live Trending Dishes
  useEffect(() => {
    trpc.recommendations.trendingNearYou
      .query({
        latitude: 12.9716,
        longitude: 77.6408,
        limit: 8,
      })
      .then((dishes: any) => {
        if (dishes && dishes.length > 0) {
          setTrendingDishes(dishes as RecommendationDish[]);
        }
      })
      .catch(() => {
        // Fallback gracefully
      });
  }, []);

  // Fetch Live Contextual Meal-Time Cravings
  useEffect(() => {
    trpc.recommendations.mealTimeCravings
      .query({
        slot: selectedSlot,
        latitude: 12.9716,
        longitude: 77.6408,
        isVeg: pureVegOnly ? true : undefined,
        limit: 6,
      })
      .then((res: any) => {
        if (res?.dishes && res.dishes.length > 0) {
          setSlotDishes(res.dishes as RecommendationDish[]);
        } else {
          setSlotDishes([]);
        }
      })
      .catch(() => {
        setSlotDishes([]);
      });
  }, [selectedSlot, pureVegOnly]);

  // Filter count badge
  const activeFiltersCount = [pureVegOnly, rating4Plus, fastDelivery, offersOnly].filter(
    Boolean
  ).length;

  const resetFilters = () => {
    setPureVegOnly(false);
    setRating4Plus(false);
    setFastDelivery(false);
    setOffersOnly(false);
    setSearchQuery('');
  };

  // Filtered restaurants
  const filteredRestaurants = useMemo(() => {
    return DEMO_RESTAURANTS.filter((rest) => {
      if (pureVegOnly && !rest.isPureVeg) return false;
      if (rating4Plus && rest.rating < 4.0) return false;
      if (fastDelivery && rest.deliveryMinutes > 25) return false;
      if (offersOnly && !rest.offerText) return false;

      if (searchQuery.trim().length > 0) {
        const q = searchQuery.toLowerCase();
        const matchName = rest.name.toLowerCase().includes(q);
        const matchCuisine = rest.cuisine.some((c) => c.toLowerCase().includes(q));
        if (!matchName && !matchCuisine) return false;
      }
      return true;
    });
  }, [pureVegOnly, rating4Plus, fastDelivery, offersOnly, searchQuery]);

  return (
    <SafeAreaView style={styles.container}>
      {/* Top Swiggy-Style Location Header */}
      <View style={styles.header}>
        <View style={styles.locationContainer}>
          <View style={styles.locationRow}>
            <Text style={styles.locationIcon}>📍</Text>
            <Text style={styles.locationTitle}>Indiranagar 100ft Rd</Text>
            <Text style={styles.dropdownIcon}>▼</Text>
          </View>
          <Text style={styles.locationSubtitle} numberOfLines={1}>
            HAL 2nd Stage, Indiranagar, Bengaluru
          </Text>
        </View>
        <TouchableOpacity style={styles.profileBadge}>
          <Text style={styles.profileInitials}>AM</Text>
        </TouchableOpacity>
      </View>

      {/* Swiggy Search Input */}
      <View style={styles.searchContainer}>
        <Text style={styles.searchIcon}>🔍</Text>
        <TextInput
          placeholder="Search 'Hyderabadi Biryani', 'South Kitchen'..."
          placeholderTextColor="#94A3B8"
          style={styles.searchInput}
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
        {searchQuery.length > 0 && (
          <TouchableOpacity onPress={() => setSearchQuery('')}>
            <Text style={styles.searchClear}>✕</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Swiggy Quick Filter Bar */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.filterBarScroll}
        contentContainerStyle={styles.filterBarContent}
      >
        {activeFiltersCount > 0 && (
          <TouchableOpacity style={styles.filterClearChip} onPress={resetFilters}>
            <Text style={styles.filterClearText}>Reset ({activeFiltersCount}) ✕</Text>
          </TouchableOpacity>
        )}

        {/* Pure Veg Pill */}
        <TouchableOpacity
          style={[styles.filterChip, pureVegOnly && styles.pureVegChipActive]}
          onPress={() => setPureVegOnly(!pureVegOnly)}
        >
          <FssaiBadge foodType={FoodType.VEG} size={13} />
          <Text style={[styles.filterChipText, pureVegOnly && styles.pureVegTextActive]}>
            Pure Veg
          </Text>
        </TouchableOpacity>

        {/* Rating 4.0+ Pill */}
        <TouchableOpacity
          style={[styles.filterChip, rating4Plus && styles.filterChipActive]}
          onPress={() => setRating4Plus(!rating4Plus)}
        >
          <Text style={styles.filterChipIcon}>★</Text>
          <Text style={[styles.filterChipText, rating4Plus && styles.filterChipTextActive]}>
            Ratings 4.0+
          </Text>
        </TouchableOpacity>

        {/* Fast Delivery Pill */}
        <TouchableOpacity
          style={[styles.filterChip, fastDelivery && styles.filterChipActive]}
          onPress={() => setFastDelivery(!fastDelivery)}
        >
          <Text style={styles.filterChipIcon}>⚡</Text>
          <Text style={[styles.filterChipText, fastDelivery && styles.filterChipTextActive]}>
            Fast Delivery (&lt;25m)
          </Text>
        </TouchableOpacity>

        {/* Offers Pill */}
        <TouchableOpacity
          style={[styles.filterChip, offersOnly && styles.filterChipActive]}
          onPress={() => setOffersOnly(!offersOnly)}
        >
          <Text style={styles.filterChipIcon}>🏷️</Text>
          <Text style={[styles.filterChipText, offersOnly && styles.filterChipTextActive]}>
            Offers
          </Text>
        </TouchableOpacity>
      </ScrollView>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        {/* Contextual Meal-Time Slot Carousel */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Contextual Meal Cravings</Text>
          <Text style={styles.sectionSubtitle}>Time-optimized recommendations</Text>
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.slotScroll}>
          {MEAL_SLOTS.map((slot) => {
            const isSelected = selectedSlot === slot.id;
            return (
              <TouchableOpacity
                key={slot.id}
                onPress={() => setSelectedSlot(slot.id)}
                style={[styles.slotPill, isSelected && styles.slotPillActive]}
              >
                <Text style={[styles.slotLabel, isSelected && styles.slotLabelActive]}>
                  {slot.label}
                </Text>
                <Text style={[styles.slotTime, isSelected && styles.slotTimeActive]}>
                  {slot.time}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {/* Dynamic Slot Dishes Carousel (If available) */}
        {slotDishes.length > 0 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.slotDishesScroll}>
            {slotDishes.map((dish) => (
              <TouchableOpacity
                key={dish.id}
                style={styles.slotDishCard}
                onPress={() => router.push(`/restaurant/${dish.restaurantId}`)}
              >
                {dish.imageUrl ? (
                  <Image source={{ uri: dish.imageUrl }} style={styles.slotDishImage} />
                ) : null}
                <View style={styles.slotDishDetails}>
                  <View style={styles.dishDietRow}>
                    <FssaiBadge foodType={dish.isVeg ? FoodType.VEG : FoodType.NON_VEG} size={11} />
                    <Text style={styles.dishDietLabel}>{dish.isVeg ? 'Veg' : 'Non-Veg'}</Text>
                  </View>
                  <Text style={styles.dishName} numberOfLines={1}>{dish.name}</Text>
                  <Text style={styles.dishRest} numberOfLines={1}>{dish.restaurantName}</Text>
                  <Text style={styles.dishPrice}>{formatPaiseToRupees(dish.pricePaise)}</Text>
                </View>
              </TouchableOpacity>
            ))}
          </ScrollView>
        )}

        {/* Hyperlocal Trending Dishes */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Trending Dishes 🔥</Text>
          <Text style={styles.sectionSubtitle}>Frequently ordered near you</Text>
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.trendingScroll}>
          {trendingDishes.map((dish) => (
            <TouchableOpacity
              key={dish.id}
              style={styles.dishCard}
              onPress={() => router.push(`/restaurant/${dish.restaurantId}`)}
            >
              {dish.imageUrl ? (
                <Image
                  source={{ uri: dish.imageUrl }}
                  style={styles.dishImage}
                />
              ) : null}
              <View style={styles.dishDetails}>
                <View style={styles.dishDietRow}>
                  <FssaiBadge foodType={dish.isVeg ? FoodType.VEG : FoodType.NON_VEG} size={12} />
                  <Text style={styles.dishDietLabel}>{dish.isVeg ? 'Pure Veg' : 'Non-Veg'}</Text>
                </View>
                <Text style={styles.dishName} numberOfLines={1}>
                  {dish.name}
                </Text>
                <Text style={styles.dishRest}>
                  {dish.restaurantName}
                  {dish.distanceMeters ? ` • ${(dish.distanceMeters / 1000).toFixed(1)} km` : ''}
                </Text>
                <Text style={styles.dishPrice}>{formatPaiseToRupees(dish.pricePaise)}</Text>
              </View>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* Curated Nearby Restaurants List */}
        <View style={styles.sectionHeader}>
          <View style={styles.restaurantCountRow}>
            <Text style={styles.sectionTitle}>Restaurants to Explore</Text>
            <Text style={styles.countBadge}>{filteredRestaurants.length}</Text>
          </View>
          <Text style={styles.sectionSubtitle}>
            {filteredRestaurants.length} places delivering to Indiranagar
          </Text>
        </View>

        {filteredRestaurants.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyIcon}>🔍</Text>
            <Text style={styles.emptyTitle}>No restaurants match your filters</Text>
            <Text style={styles.emptySub}>Try removing filter pills or changing search</Text>
            <TouchableOpacity style={styles.resetButton} onPress={resetFilters}>
              <Text style={styles.resetButtonText}>Reset All Filters</Text>
            </TouchableOpacity>
          </View>
        ) : (
          filteredRestaurants.map((rest) => (
            <TouchableOpacity
              key={rest.id}
              style={styles.restaurantCard}
              onPress={() => router.push(`/restaurant/${rest.id}`)}
            >
              <View style={styles.imageContainer}>
                <Image source={{ uri: rest.imageUrl }} style={styles.restaurantImage} />
                {rest.offerText && (
                  <View style={styles.offerBadge}>
                    <Text style={styles.offerBadgeText}>🏷️ {rest.offerText}</Text>
                  </View>
                )}
                {rest.isPureVeg && (
                  <View style={styles.pureVegBadge}>
                    <FssaiBadge foodType={FoodType.VEG} size={11} />
                    <Text style={styles.pureVegBadgeText}>PURE VEG</Text>
                  </View>
                )}
              </View>

              <View style={styles.restaurantInfo}>
                <View style={styles.restTopRow}>
                  <Text style={styles.restaurantName} numberOfLines={1}>
                    {rest.name}
                  </Text>
                  <View style={styles.ratingBadge}>
                    <Text style={styles.ratingText}>★ {rest.rating}</Text>
                  </View>
                </View>
                <Text style={styles.restMeta}>
                  {rest.deliveryTime} • {rest.distanceKm}
                </Text>
                <Text style={styles.restCuisine} numberOfLines={1}>
                  {rest.cuisine.join(' • ')}
                </Text>
              </View>
            </TouchableOpacity>
          ))
        )}
      </ScrollView>

      {/* Floating Bottom Cart Bar */}
      {cartCount > 0 && (
        <View style={styles.floatingCartContainer}>
          <TouchableOpacity
            style={styles.floatingCartButton}
            onPress={() => router.push('/cart')}
          >
            <View>
              <Text style={styles.cartCountText}>
                {cartCount} {cartCount === 1 ? 'item' : 'items'} added
              </Text>
              <Text style={styles.cartSubtotalText}>
                {formatPaiseToRupees(cartSubtotal)} plus taxes
              </Text>
            </View>
            <View style={styles.viewCartRow}>
              <Text style={styles.viewCartText}>View Cart</Text>
              <Text style={styles.viewCartArrow}>→</Text>
            </View>
          </TouchableOpacity>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFFFFF' },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
  },
  locationContainer: { flex: 1, paddingRight: 10 },
  locationRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  locationIcon: { fontSize: 18 },
  locationTitle: { fontSize: 16, fontWeight: '800', color: '#0F172A' },
  dropdownIcon: { fontSize: 10, color: '#64748B', marginLeft: 4 },
  locationSubtitle: { fontSize: 12, color: '#64748B', marginTop: 2 },
  profileBadge: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#0D9488',
    alignItems: 'center',
    justifyContent: 'center',
  },
  profileInitials: { color: '#FFFFFF', fontWeight: '800', fontSize: 13 },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginTop: 6,
    marginBottom: 8,
    backgroundColor: '#F1F5F9',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  searchIcon: { fontSize: 16, marginRight: 8 },
  searchInput: { flex: 1, fontSize: 14, color: '#0F172A' },
  searchClear: { fontSize: 14, color: '#94A3B8', paddingHorizontal: 4 },
  filterBarScroll: { maxHeight: 44, marginBottom: 4 },
  filterBarContent: { paddingHorizontal: 16, gap: 8, alignItems: 'center' },
  filterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    backgroundColor: '#FFFFFF',
    gap: 5,
  },
  filterChipActive: { borderColor: '#0D9488', backgroundColor: '#F0FDFA' },
  pureVegChipActive: { borderColor: '#16A34A', backgroundColor: '#F0FDF4' },
  filterChipIcon: { fontSize: 12, color: '#475569' },
  filterChipText: { fontSize: 12, fontWeight: '700', color: '#475569' },
  filterChipTextActive: { color: '#0D9488', fontWeight: '800' },
  pureVegTextActive: { color: '#15803D', fontWeight: '800' },
  filterClearChip: {
    backgroundColor: '#0F172A',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 18,
  },
  filterClearText: { color: '#FFFFFF', fontSize: 11, fontWeight: '800' },
  scrollContent: { paddingBottom: 110 },
  sectionHeader: { paddingHorizontal: 16, marginTop: 18, marginBottom: 8 },
  restaurantCountRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  sectionTitle: { fontSize: 18, fontWeight: '800', color: '#0F172A' },
  countBadge: {
    backgroundColor: '#F1F5F9',
    color: '#0D9488',
    fontWeight: '800',
    fontSize: 12,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  sectionSubtitle: { fontSize: 12, color: '#64748B', marginTop: 2 },
  slotScroll: { paddingLeft: 16, marginTop: 4 },
  slotPill: {
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginRight: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  slotPillActive: { backgroundColor: '#F0FDFA', borderColor: '#0D9488' },
  slotLabel: { fontSize: 13, fontWeight: '700', color: '#334155' },
  slotLabelActive: { color: '#0D9488' },
  slotTime: { fontSize: 10, color: '#94A3B8', marginTop: 2 },
  slotTimeActive: { color: '#0F766E' },
  slotDishesScroll: { paddingLeft: 16, marginTop: 10, marginBottom: 4 },
  slotDishCard: {
    width: 140,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    marginRight: 10,
    borderWidth: 1,
    borderColor: '#F1F5F9',
    overflow: 'hidden',
  },
  slotDishImage: { width: '100%', height: 85 },
  slotDishDetails: { padding: 8 },
  trendingScroll: { paddingLeft: 16, marginTop: 4 },
  dishCard: {
    width: 170,
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    marginRight: 12,
    borderWidth: 1,
    borderColor: '#F1F5F9',
    overflow: 'hidden',
  },
  dishImage: { width: '100%', height: 110 },
  dishDetails: { padding: 8 },
  dishDietRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 2 },
  dishDietLabel: { fontSize: 10, fontWeight: '700', color: '#64748B' },
  dishName: { fontSize: 13, fontWeight: '700', color: '#0F172A' },
  dishRest: { fontSize: 11, color: '#64748B', marginVertical: 2 },
  dishPrice: { fontSize: 13, fontWeight: '800', color: '#0F172A' },
  restaurantCard: {
    marginHorizontal: 16,
    marginVertical: 8,
    borderRadius: 16,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
  },
  imageContainer: { position: 'relative' },
  restaurantImage: { width: '100%', height: 160 },
  offerBadge: {
    position: 'absolute',
    bottom: 8,
    left: 8,
    backgroundColor: 'rgba(15, 23, 42, 0.88)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  offerBadgeText: { color: '#FCD34D', fontSize: 11, fontWeight: '800' },
  pureVegBadge: {
    position: 'absolute',
    top: 8,
    right: 8,
    backgroundColor: '#FFFFFF',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 2,
  },
  pureVegBadgeText: { color: '#15803D', fontSize: 10, fontWeight: '800' },
  restaurantInfo: { padding: 12 },
  restTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  restaurantName: { fontSize: 16, fontWeight: '800', color: '#0F172A', flex: 1, paddingRight: 8 },
  ratingBadge: {
    backgroundColor: '#15803D',
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 6,
  },
  ratingText: { color: '#FFFFFF', fontSize: 12, fontWeight: '700' },
  restMeta: { fontSize: 12, color: '#64748B', marginTop: 4, fontWeight: '500' },
  restCuisine: { fontSize: 12, color: '#94A3B8', marginTop: 2 },
  emptyContainer: { alignItems: 'center', padding: 40 },
  emptyIcon: { fontSize: 44, marginBottom: 8 },
  emptyTitle: { fontSize: 16, fontWeight: '800', color: '#0F172A' },
  emptySub: { fontSize: 13, color: '#64748B', marginTop: 2 },
  resetButton: {
    marginTop: 16,
    backgroundColor: '#0D9488',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 10,
  },
  resetButtonText: { color: '#FFFFFF', fontWeight: '800', fontSize: 13 },
  floatingCartContainer: {
    position: 'absolute',
    bottom: 20,
    left: 16,
    right: 16,
  },
  floatingCartButton: {
    backgroundColor: '#0D9488',
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    shadowColor: '#0D9488',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 6,
  },
  cartCountText: { color: '#FFFFFF', fontWeight: '800', fontSize: 14 },
  cartSubtotalText: { color: '#99F6E4', fontSize: 12, marginTop: 1 },
  viewCartRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  viewCartText: { color: '#FFFFFF', fontWeight: '800', fontSize: 15 },
  viewCartArrow: { color: '#FFFFFF', fontSize: 16, fontWeight: '800' },
});
