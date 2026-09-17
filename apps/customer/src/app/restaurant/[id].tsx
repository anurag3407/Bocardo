import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Image,
  StyleSheet,
  SafeAreaView,
  Switch,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { formatPaiseToRupees } from '@bocardo/shared-types';
import { cartStore } from '../../lib/cart';

const DEMO_MENU = {
  id: 'rest-1-uuid',
  name: 'Biryani Bliss & Kebabs',
  rating: 4.6,
  deliveryTime: '25-30 mins',
  address: '100 Feet Rd, HAL 2nd Stage, Indiranagar',
  dishes: [
    {
      id: 'dish-1-uuid',
      name: 'Hyderabadi Dum Biryani',
      pricePaise: 32000,
      isVeg: false,
      category: 'Bestseller Biryani',
      description: 'Slow cooked aromatic fragrant basmati rice with marinated chicken, secret spices & saffron.',
      imageUrl: 'https://images.unsplash.com/photo-1563379091339-03b21ab4a4f8?w=500',
    },
    {
      id: 'dish-2-uuid',
      name: 'Paneer Tikka Biryani',
      pricePaise: 28000,
      isVeg: true,
      category: 'Bestseller Biryani',
      description: 'Charcoal grilled cottage cheese cubes layered with basmati rice and caramelized onions.',
      imageUrl: 'https://images.unsplash.com/photo-1645177628172-a94c1f96e6db?w=500',
    },
    {
      id: 'dish-3-uuid',
      name: 'Burani Garlic Raita & Salan',
      pricePaise: 6000,
      isVeg: true,
      category: 'Accompaniments',
      description: 'Slow roasted garlic infused thick curd raita with classic Hyderabadi mirchi ka salan.',
      imageUrl: 'https://images.unsplash.com/photo-1546833999-b9f581a1996d?w=500',
    },
    {
      id: 'dish-4-uuid',
      name: 'Gulab Jamun (2 Pcs)',
      pricePaise: 8000,
      isVeg: true,
      category: 'Desserts',
      description: 'Traditional melt-in-mouth milk dumplings soaked in saffron and cardamom sugar syrup.',
      imageUrl: 'https://images.unsplash.com/photo-1601050690597-df0568f70950?w=500',
    },
  ],
};

export default function RestaurantMenuScreen() {
  const { id } = useLocalSearchParams();
  const router = useRouter();
  const [vegOnly, setVegOnly] = useState(false);
  const [, setTick] = useState(0);

  useEffect(() => {
    return cartStore.subscribe(() => setTick((t) => t + 1));
  }, []);

  const filteredDishes = vegOnly
    ? DEMO_MENU.dishes.filter((d) => d.isVeg)
    : DEMO_MENU.dishes;

  const totalItems = cartStore.getItems().reduce((acc, i) => acc + i.quantity, 0);
  const subtotalPaise = cartStore.getSubtotalPaise();

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Restaurant Header Banner */}
        <View style={styles.restaurantHeader}>
          <Text style={styles.restaurantTitle}>{DEMO_MENU.name}</Text>
          <Text style={styles.restaurantAddress}>{DEMO_MENU.address}</Text>
          <View style={styles.metaRow}>
            <View style={styles.ratingBadge}>
              <Text style={styles.ratingText}>★ {DEMO_MENU.rating}</Text>
            </View>
            <Text style={styles.metaText}>• {DEMO_MENU.deliveryTime}</Text>
            <Text style={styles.metaText}>• ₹40 Delivery Fee</Text>
          </View>

          {/* Veg Only Filter Toggle */}
          <View style={styles.filterRow}>
            <Text style={styles.filterLabel}>Veg Only</Text>
            <Switch
              value={vegOnly}
              onValueChange={setVegOnly}
              trackColor={{ false: '#E2E8F0', true: '#86EFAC' }}
              thumbColor={vegOnly ? '#16A34A' : '#94A3B8'}
            />
          </View>
        </View>

        {/* Menu Items */}
        <View style={styles.menuContainer}>
          {filteredDishes.map((dish) => {
            const qty = cartStore.getItemQuantity(dish.id);
            return (
              <View key={dish.id} style={styles.dishRow}>
                <View style={styles.dishLeft}>
                  {/* Veg / Non-Veg Icon */}
                  <View
                    style={[
                      styles.vegIconOuter,
                      { borderColor: dish.isVeg ? '#16A34A' : '#991B1B' },
                    ]}
                  >
                    <View
                      style={[
                        styles.vegIconInner,
                        { backgroundColor: dish.isVeg ? '#16A34A' : '#991B1B' },
                      ]}
                    />
                  </View>
                  <Text style={styles.dishName}>{dish.name}</Text>
                  <Text style={styles.dishPrice}>{formatPaiseToRupees(dish.pricePaise)}</Text>
                  <Text style={styles.dishDescription} numberOfLines={2}>
                    {dish.description}
                  </Text>
                </View>

                {/* Dish Image + Add Button Stepper */}
                <View style={styles.dishRight}>
                  <Image source={{ uri: dish.imageUrl }} style={styles.dishImage} />
                  {qty === 0 ? (
                    <TouchableOpacity
                      style={styles.addButton}
                      onPress={() =>
                        cartStore.addItem({
                          dishId: dish.id,
                          name: dish.name,
                          pricePaise: dish.pricePaise,
                          isVeg: dish.isVeg,
                          restaurantId: DEMO_MENU.id,
                          restaurantName: DEMO_MENU.name,
                        })
                      }
                    >
                      <Text style={styles.addButtonText}>ADD</Text>
                    </TouchableOpacity>
                  ) : (
                    <View style={styles.stepperContainer}>
                      <TouchableOpacity
                        style={styles.stepperButton}
                        onPress={() => cartStore.removeItem(dish.id)}
                      >
                        <Text style={styles.stepperButtonText}>−</Text>
                      </TouchableOpacity>
                      <Text style={styles.stepperQuantity}>{qty}</Text>
                      <TouchableOpacity
                        style={styles.stepperButton}
                        onPress={() =>
                          cartStore.addItem({
                            dishId: dish.id,
                            name: dish.name,
                            pricePaise: dish.pricePaise,
                            isVeg: dish.isVeg,
                            restaurantId: DEMO_MENU.id,
                            restaurantName: DEMO_MENU.name,
                          })
                        }
                      >
                        <Text style={styles.stepperButtonText}>+</Text>
                      </TouchableOpacity>
                    </View>
                  )}
                </View>
              </View>
            );
          })}
        </View>
      </ScrollView>

      {/* Floating Bottom Cart Bar */}
      {totalItems > 0 && (
        <View style={styles.floatingCartContainer}>
          <TouchableOpacity
            style={styles.floatingCartButton}
            onPress={() => router.push('/cart')}
          >
            <View>
              <Text style={styles.cartCountText}>
                {totalItems} {totalItems === 1 ? 'item' : 'items'} added
              </Text>
              <Text style={styles.cartSubtotalText}>
                {formatPaiseToRupees(subtotalPaise)} plus taxes
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
  scrollContent: { paddingBottom: 110 },
  restaurantHeader: {
    padding: 16,
    borderBottomWidth: 8,
    borderBottomColor: '#F1F5F9',
  },
  restaurantTitle: { fontSize: 22, fontWeight: '800', color: '#0F172A' },
  restaurantAddress: { fontSize: 13, color: '#64748B', marginTop: 4 },
  metaRow: { flexDirection: 'row', alignItems: 'center', marginTop: 8, gap: 8 },
  ratingBadge: {
    backgroundColor: '#15803D',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  ratingText: { color: '#FFFFFF', fontSize: 12, fontWeight: '700' },
  metaText: { fontSize: 13, color: '#475569', fontWeight: '500' },
  filterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  filterLabel: { fontSize: 14, fontWeight: '700', color: '#0F172A' },
  menuContainer: { paddingHorizontal: 16 },
  dishRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 18,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  dishLeft: { flex: 1, paddingRight: 14 },
  vegIconOuter: {
    width: 14,
    height: 14,
    borderWidth: 1.5,
    borderRadius: 3,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  vegIconInner: { width: 6, height: 6, borderRadius: 3 },
  dishName: { fontSize: 16, fontWeight: '700', color: '#0F172A' },
  dishPrice: { fontSize: 14, fontWeight: '800', color: '#1E293B', marginTop: 4 },
  dishDescription: { fontSize: 12, color: '#64748B', marginTop: 6, lineHeight: 17 },
  dishRight: { width: 110, alignItems: 'center' },
  dishImage: { width: 100, height: 90, borderRadius: 12 },
  addButton: {
    position: 'absolute',
    bottom: -10,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#FC8019',
    paddingHorizontal: 22,
    paddingVertical: 6,
    borderRadius: 8,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  addButtonText: { color: '#FC8019', fontWeight: '800', fontSize: 13 },
  stepperContainer: {
    position: 'absolute',
    bottom: -10,
    backgroundColor: '#FC8019',
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 5,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 3,
  },
  stepperButton: { paddingHorizontal: 6 },
  stepperButtonText: { color: '#FFFFFF', fontSize: 16, fontWeight: '800' },
  stepperQuantity: { color: '#FFFFFF', fontWeight: '800', fontSize: 14, marginHorizontal: 8 },
  floatingCartContainer: { position: 'absolute', bottom: 20, left: 16, right: 16 },
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
