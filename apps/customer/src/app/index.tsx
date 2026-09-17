import React, { useState, useEffect } from 'react';
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
import { formatPaiseToRupees, MealSlot } from '@bocardo/shared-types';
import { cartStore } from '../lib/cart';

// Demo fallback data for instant render if backend is not yet populated
const DEMO_RESTAURANTS = [
  {
    id: 'rest-1-uuid',
    name: 'Biryani Bliss & Kebabs',
    rating: 4.6,
    deliveryTime: '25-30 mins',
    cuisine: ['Biryani', 'Mughlai', 'Kebabs'],
    distanceKm: '1.2 km',
    imageUrl: 'https://images.unsplash.com/photo-1563379091339-03b21ab4a4f8?w=800',
    isAcceptingOrders: true,
  },
  {
    id: 'rest-2-uuid',
    name: 'South Kitchen Tiffin Express',
    rating: 4.4,
    deliveryTime: '20-25 mins',
    cuisine: ['South Indian', 'Breakfast', 'Dosa'],
    distanceKm: '2.1 km',
    imageUrl: 'https://images.unsplash.com/photo-1610192244261-3f33de3f55e4?w=800',
    isAcceptingOrders: true,
  },
  {
    id: 'rest-3-uuid',
    name: 'The Burger Barn & Shakes',
    rating: 4.3,
    deliveryTime: '30-35 mins',
    cuisine: ['Burgers', 'American', 'Wings'],
    distanceKm: '3.4 km',
    imageUrl: 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=800',
    isAcceptingOrders: true,
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
  const [selectedSlot, setSelectedSlot] = useState<MealSlot>(MealSlot.LUNCH);
  const [cartCount, setCartCount] = useState(0);
  const [cartSubtotal, setCartSubtotal] = useState(0);

  useEffect(() => {
    const updateCart = () => {
      const items = cartStore.getItems();
      setCartCount(items.reduce((acc, i) => acc + i.quantity, 0));
      setCartSubtotal(cartStore.getSubtotalPaise());
    };
    updateCart();
    return cartStore.subscribe(updateCart);
  }, []);

  return (
    <SafeAreaView style={styles.container}>
      {/* Top Header */}
      <View style={styles.header}>
        <View>
          <View style={styles.locationRow}>
            <Text style={styles.locationIcon}>📍</Text>
            <Text style={styles.locationTitle}>Indiranagar 100ft Rd</Text>
            <Text style={styles.dropdownIcon}>▼</Text>
          </View>
          <Text style={styles.locationSubtitle}>Bengaluru, Karnataka 560038</Text>
        </View>
        <TouchableOpacity style={styles.profileBadge}>
          <Text style={styles.profileInitials}>AM</Text>
        </TouchableOpacity>
      </View>

      {/* Search Input */}
      <View style={styles.searchContainer}>
        <Text style={styles.searchIcon}>🔍</Text>
        <TextInput
          placeholder="Search 'Hyderabadi Biryani', 'Masala Dosa'..."
          placeholderTextColor="#94A3B8"
          style={styles.searchInput}
        />
      </View>

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

        {/* Hyperlocal Trending Dishes */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Trending Near You 🔥</Text>
          <Text style={styles.sectionSubtitle}>PostGIS 5km spatial velocity</Text>
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.trendingScroll}>
          <TouchableOpacity
            style={styles.dishCard}
            onPress={() => router.push('/restaurant/rest-1-uuid')}
          >
            <Image
              source={{ uri: 'https://images.unsplash.com/photo-1563379091339-03b21ab4a4f8?w=400' }}
              style={styles.dishImage}
            />
            <View style={styles.dishDetails}>
              <Text style={styles.dishName} numberOfLines={1}>Hyderabadi Dum Biryani</Text>
              <Text style={styles.dishRest}>Biryani Bliss • 1.2 km</Text>
              <Text style={styles.dishPrice}>{formatPaiseToRupees(32000)}</Text>
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.dishCard}
            onPress={() => router.push('/restaurant/rest-2-uuid')}
          >
            <Image
              source={{ uri: 'https://images.unsplash.com/photo-1610192244261-3f33de3f55e4?w=400' }}
              style={styles.dishImage}
            />
            <View style={styles.dishDetails}>
              <Text style={styles.dishName} numberOfLines={1}>Crispy Ghee Podi Dosa</Text>
              <Text style={styles.dishRest}>South Kitchen • 2.1 km</Text>
              <Text style={styles.dishPrice}>{formatPaiseToRupees(14000)}</Text>
            </View>
          </TouchableOpacity>
        </ScrollView>

        {/* Curated Nearby Restaurants List */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>All Restaurants Around You</Text>
          <Text style={styles.sectionSubtitle}>{DEMO_RESTAURANTS.length} restaurants delivering now</Text>
        </View>

        {DEMO_RESTAURANTS.map((rest) => (
          <TouchableOpacity
            key={rest.id}
            style={styles.restaurantCard}
            onPress={() => router.push(`/restaurant/${rest.id}`)}
          >
            <Image source={{ uri: rest.imageUrl }} style={styles.restaurantImage} />
            <View style={styles.restaurantInfo}>
              <View style={styles.restTopRow}>
                <Text style={styles.restaurantName}>{rest.name}</Text>
                <View style={styles.ratingBadge}>
                  <Text style={styles.ratingText}>★ {rest.rating}</Text>
                </View>
              </View>
              <Text style={styles.restMeta}>
                {rest.deliveryTime} • {rest.distanceKm}
              </Text>
              <Text style={styles.restCuisine}>{rest.cuisine.join(', ')}</Text>
            </View>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Floating Bottom Cart Bar */}
      {cartCount > 0 && (
        <View style={styles.floatingCartContainer}>
          <TouchableOpacity
            style={styles.floatingCartButton}
            onPress={() => router.push('/cart')}
          >
            <View>
              <Text style={styles.cartCountText}>{cartCount} {cartCount === 1 ? 'item' : 'items'} added</Text>
              <Text style={styles.cartSubtotalText}>{formatPaiseToRupees(cartSubtotal)} plus taxes</Text>
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
  locationRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  locationIcon: { fontSize: 18 },
  locationTitle: { fontSize: 16, fontWeight: '800', color: '#0F172A' },
  dropdownIcon: { fontSize: 10, color: '#64748B', marginLeft: 4 },
  locationSubtitle: { fontSize: 12, color: '#64748B', marginTop: 2 },
  profileBadge: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#FC8019',
    alignItems: 'center',
    justifyContent: 'center',
  },
  profileInitials: { color: '#FFFFFF', fontWeight: '700', fontSize: 14 },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginVertical: 8,
    backgroundColor: '#F1F5F9',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  searchIcon: { fontSize: 16, marginRight: 8 },
  searchInput: { flex: 1, fontSize: 14, color: '#0F172A' },
  scrollContent: { paddingBottom: 100 },
  sectionHeader: { paddingHorizontal: 16, marginTop: 18, marginBottom: 8 },
  sectionTitle: { fontSize: 18, fontWeight: '800', color: '#0F172A' },
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
  slotPillActive: { backgroundColor: '#FFF2E8', borderColor: '#FC8019' },
  slotLabel: { fontSize: 13, fontWeight: '700', color: '#334155' },
  slotLabelActive: { color: '#FC8019' },
  slotTime: { fontSize: 10, color: '#94A3B8', marginTop: 2 },
  slotTimeActive: { color: '#E26D0A' },
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
  },
  restaurantImage: { width: '100%', height: 160 },
  restaurantInfo: { padding: 12 },
  restTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  restaurantName: { fontSize: 16, fontWeight: '800', color: '#0F172A', flex: 1 },
  ratingBadge: {
    backgroundColor: '#15803D',
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 6,
  },
  ratingText: { color: '#FFFFFF', fontSize: 12, fontWeight: '700' },
  restMeta: { fontSize: 12, color: '#64748B', marginTop: 4 },
  restCuisine: { fontSize: 12, color: '#94A3B8', marginTop: 2 },
  floatingCartContainer: {
    position: 'absolute',
    bottom: 20,
    left: 16,
    right: 16,
  },
  floatingCartButton: {
    backgroundColor: '#FC8019',
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    shadowColor: '#FC8019',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 6,
  },
  cartCountText: { color: '#FFFFFF', fontWeight: '800', fontSize: 14 },
  cartSubtotalText: { color: '#FFE0C2', fontSize: 12, marginTop: 1 },
  viewCartRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  viewCartText: { color: '#FFFFFF', fontWeight: '800', fontSize: 15 },
  viewCartArrow: { color: '#FFFFFF', fontSize: 16, fontWeight: '800' },
});
