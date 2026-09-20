import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  TextInput,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { formatPaiseToRupees, FoodType } from '@bocardo/shared-types';
import { cartStore, CartItem } from '../lib/cart';
import { FssaiBadge } from '../components/FssaiBadge';
import { trpc } from '../lib/api';

interface UpsellDish {
  id: string;
  name: string;
  pricePaise: number;
  isVeg: boolean;
  restaurantId?: string;
}

const DEFAULT_UPSELL: UpsellDish[] = [
  {
    id: 'dish-upsell-raita',
    name: 'Burani Garlic Raita',
    pricePaise: 6000,
    isVeg: true,
  },
];

export default function CartScreen() {
  const router = useRouter();
  const [items, setItems] = useState<CartItem[]>([]);
  const [tipPaise, setTipPaise] = useState(3000); // ₹30 default tip
  const [instructions, setInstructions] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [upsellItems, setUpsellItems] = useState<UpsellDish[]>(DEFAULT_UPSELL);

  useEffect(() => {
    setItems(cartStore.getItems());
    return cartStore.subscribe(() => setItems(cartStore.getItems()));
  }, []);

  useEffect(() => {
    const currentItems = cartStore.getItems();
    const restId = cartStore.getRestaurantId();
    if (currentItems.length > 0) {
      const dishIds = [...new Set(currentItems.map((i) => i.dishId))].filter(Boolean);
      // Fetch live co-occurrence pairings from recommendations router
      trpc.recommendations.frequentlyBoughtTogether
        .query({
          dishIds,
          restaurantId: restId || undefined,
          limit: 4,
        })
        .then((pairings: any) => {
          if (pairings && pairings.length > 0) {
            setUpsellItems(pairings);
          }
        })
        .catch(() => {
          // Keep default fallback gracefully
        });
    }
  }, [items]);

  const totals = cartStore.getTotals();
  const grandTotalPaise = totals.totalAmountPaise + tipPaise;

  const handleCheckout = async () => {
    if (items.length === 0) return;
    setIsSubmitting(true);

    try {
      let restId = cartStore.getRestaurantId();
      let orderItems = items.map((i) => ({ dishId: i.dishId, quantity: i.quantity }));

      const isUuid = (id?: string) =>
        typeof id === 'string' &&
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);

      // Demo/dev mode: if mock string IDs are in cart, resolve to real database entities
      if (!restId || !isUuid(restId) || orderItems.some((i) => !isUuid(i.dishId))) {
        try {
          const nearby = await trpc.restaurant.listNearby.query({
            latitude: 12.9716,
            longitude: 77.6408,
          });
          if (nearby && nearby.length > 0) {
            const liveRest = await trpc.restaurant.getById.query({ restaurantId: nearby[0].id });
            if (liveRest && liveRest.dishes && liveRest.dishes.length > 0) {
              restId = liveRest.id;
              orderItems = [
                { dishId: liveRest.dishes[0].id, quantity: items[0]?.quantity || 1 },
              ];
            }
          }
        } catch {
          // If offline or listNearby fails, proceed with existing IDs
        }
      }

      if (!restId) {
        throw new Error('Restaurant details are unavailable. Please reselect your meal.');
      }

      const orderResult = await trpc.order.create.mutate({
        restaurantId: restId,
        items: orderItems,
        deliveryLatitude: 12.9716,
        deliveryLongitude: 77.6408,
        deliveryAddress: '42, 100 Feet Road, Indiranagar, Bengaluru 560038',
        specialInstructions: instructions.trim() || undefined,
        tipPaise,
      });

      cartStore.clear();
      router.replace(`/orders/${orderResult.orderId}`);
    } catch (e: any) {
      Alert.alert('Checkout Failed', e.message || 'Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (items.length === 0) {
    return (
      <SafeAreaView style={styles.emptyContainer}>
        <Text style={styles.emptyIcon}>🛒</Text>
        <Text style={styles.emptyTitle}>Your cart is empty</Text>
        <Text style={styles.emptySubtitle}>
          Explore top restaurants around you and add delicious dishes!
        </Text>
        <TouchableOpacity style={styles.browseButton} onPress={() => router.back()}>
          <Text style={styles.browseButtonText}>Browse Restaurants</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* Navbar */}
      <View style={styles.navbar}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Text style={styles.backBtnText}>←</Text>
        </TouchableOpacity>
        <View style={styles.navTitleCol}>
          <Text style={styles.navTitle}>{cartStore.getRestaurantName()}</Text>
          <Text style={styles.navSub}>Delivery to Indiranagar 100ft Rd</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Delivery ETA Alert */}
        <View style={styles.etaBanner}>
          <Text style={styles.etaIcon}>⚡</Text>
          <Text style={styles.etaText}>Delivery in 25-30 mins to Indiranagar 100ft Rd</Text>
        </View>

        {/* Cart Items List */}
        <View style={styles.card}>
          <View style={styles.cardHeaderRow}>
            <Text style={styles.cardTitle}>Item Summary</Text>
            <Text style={styles.itemsCountBadge}>
              {items.reduce((sum, i) => sum + i.quantity, 0)} items
            </Text>
          </View>

          {items.map((item) => (
            <View key={item.lineId} style={styles.itemRow}>
              <View style={styles.itemLeft}>
                <View style={styles.itemNameRow}>
                  <FssaiBadge foodType={item.isVeg ? FoodType.VEG : FoodType.NON_VEG} size={14} />
                  <Text style={styles.itemName} numberOfLines={1}>
                    {item.name}
                  </Text>
                </View>

                {/* Customization Details */}
                {(item.variantName || (item.addOnSummary && item.addOnSummary.length > 0)) && (
                  <View style={styles.customizationBox}>
                    {item.variantName && (
                      <Text style={styles.customizationText}>Portion: {item.variantName}</Text>
                    )}
                    {item.addOnSummary && item.addOnSummary.length > 0 && (
                      <Text style={styles.customizationText}>
                        + {item.addOnSummary.join(', ')}
                      </Text>
                    )}
                  </View>
                )}

                <Text style={styles.itemPrice}>
                  {formatPaiseToRupees(item.pricePaise * item.quantity)}
                </Text>
              </View>

              {/* Stepper mapped directly to lineId */}
              <View style={styles.stepperContainer}>
                <TouchableOpacity
                  style={styles.stepperBtn}
                  onPress={() => cartStore.removeItem(item.lineId)}
                >
                  <Text style={styles.stepperText}>−</Text>
                </TouchableOpacity>
                <Text style={styles.qtyText}>{item.quantity}</Text>
                <TouchableOpacity
                  style={styles.stepperBtn}
                  onPress={() =>
                    cartStore.addItem({
                      ...item,
                      quantity: 1,
                    })
                  }
                >
                  <Text style={styles.stepperText}>+</Text>
                </TouchableOpacity>
              </View>
            </View>
          ))}
        </View>

        {/* Co-Occurrence Upsell Tray ("Complete Your Meal") */}
        {upsellItems.length > 0 && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Complete Your Meal ✨</Text>
            <Text style={styles.cardSubtitle}>Frequently ordered together</Text>
            {upsellItems.map((upsell) => (
              <View key={upsell.id} style={styles.upsellRow}>
                <View style={styles.upsellItem}>
                  <View style={styles.upsellDetails}>
                    <View style={styles.upsellBadgeRow}>
                      <FssaiBadge foodType={upsell.isVeg ? FoodType.VEG : FoodType.NON_VEG} size={12} />
                      <Text style={styles.upsellName} numberOfLines={1}>{upsell.name}</Text>
                    </View>
                    <Text style={styles.upsellPrice}>{formatPaiseToRupees(upsell.pricePaise)}</Text>
                  </View>
                  <TouchableOpacity
                    style={styles.upsellAddBtn}
                    onPress={() =>
                      cartStore.addItem({
                        dishId: upsell.id,
                        name: upsell.name,
                        pricePaise: upsell.pricePaise,
                        isVeg: upsell.isVeg,
                        restaurantId: upsell.restaurantId || cartStore.getRestaurantId()!,
                        restaurantName: cartStore.getRestaurantName()!,
                      })
                    }
                  >
                    <Text style={styles.upsellAddText}>+ ADD</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))}
          </View>
        )}

        {/* Tip Your Delivery Partner */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Delivery Partner Tip</Text>
          <Text style={styles.cardSubtitle}>
            100% of the tip goes directly to your delivery partner
          </Text>
          <View style={styles.tipRow}>
            {[
              { label: '₹20', paise: 2000 },
              { label: '₹30', paise: 3000 },
              { label: '₹50', paise: 5000 },
            ].map((tip) => (
              <TouchableOpacity
                key={tip.label}
                style={[styles.tipChip, tipPaise === tip.paise && styles.tipChipActive]}
                onPress={() => setTipPaise(tipPaise === tip.paise ? 0 : tip.paise)}
              >
                <Text style={[styles.tipText, tipPaise === tip.paise && styles.tipTextActive]}>
                  {tip.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Delivery / Cooking Instructions */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Delivery Instructions</Text>
          <TextInput
            placeholder="e.g. Please leave at door, don't ring bell..."
            placeholderTextColor="#94A3B8"
            style={styles.instructionInput}
            value={instructions}
            onChangeText={setInstructions}
          />
        </View>

        {/* Section 9(5) CGST Dual-Tax Itemized Bill */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Bill Details</Text>
          <View style={styles.billRow}>
            <Text style={styles.billLabel}>Item Total</Text>
            <Text style={styles.billValue}>{formatPaiseToRupees(totals.subtotalPaise)}</Text>
          </View>
          <View style={styles.billRow}>
            <Text style={styles.billLabel}>Restaurant GST (5% Sec 9(5))</Text>
            <Text style={styles.billValue}>{formatPaiseToRupees(totals.foodGstPaise)}</Text>
          </View>
          <View style={styles.billRow}>
            <Text style={styles.billLabel}>Delivery Partner Fee</Text>
            <Text style={styles.billValue}>{formatPaiseToRupees(totals.deliveryFeePaise)}</Text>
          </View>
          <View style={styles.billRow}>
            <Text style={styles.billLabel}>Platform Convenience Fee</Text>
            <Text style={styles.billValue}>{formatPaiseToRupees(totals.platformFeePaise)}</Text>
          </View>
          <View style={styles.billRow}>
            <Text style={styles.billLabel}>Service GST (18% on fees)</Text>
            <Text style={styles.billValue}>{formatPaiseToRupees(totals.serviceGstPaise)}</Text>
          </View>
          {tipPaise > 0 && (
            <View style={styles.billRow}>
              <Text style={styles.billLabel}>Delivery Tip</Text>
              <Text style={styles.billValue}>{formatPaiseToRupees(tipPaise)}</Text>
            </View>
          )}
          <View style={[styles.billRow, styles.grandTotalRow]}>
            <Text style={styles.grandTotalLabel}>To Pay</Text>
            <Text style={styles.grandTotalValue}>{formatPaiseToRupees(grandTotalPaise)}</Text>
          </View>
        </View>
      </ScrollView>

      {/* High-Contrast Checkout Bar */}
      <View style={styles.checkoutBar}>
        <View>
          <Text style={styles.checkoutTotal}>{formatPaiseToRupees(grandTotalPaise)}</Text>
          <Text style={styles.checkoutViewBill}>INCL. ALL TAXES & CHARGES</Text>
        </View>
        <TouchableOpacity
          style={styles.payButton}
          onPress={handleCheckout}
          disabled={isSubmitting}
        >
          {isSubmitting ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text style={styles.payButtonText}>Proceed to Pay →</Text>
          )}
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  navbar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  backBtn: { padding: 4, marginRight: 10 },
  backBtnText: { fontSize: 20, fontWeight: '700', color: '#0F172A' },
  navTitleCol: { flex: 1 },
  navTitle: { fontSize: 16, fontWeight: '800', color: '#0F172A' },
  navSub: { fontSize: 11, color: '#64748B', marginTop: 1 },
  scrollContent: { padding: 16, paddingBottom: 110 },
  etaBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F0FDFA',
    borderWidth: 1,
    borderColor: '#CCFBF1',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: 12,
    gap: 8,
  },
  etaIcon: { fontSize: 16 },
  etaText: { fontSize: 12, fontWeight: '700', color: '#0F766E' },
  emptyContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  emptyIcon: { fontSize: 64, marginBottom: 12 },
  emptyTitle: { fontSize: 20, fontWeight: '800', color: '#0F172A' },
  emptySubtitle: { fontSize: 14, color: '#64748B', textAlign: 'center', marginTop: 6 },
  browseButton: {
    backgroundColor: '#0D9488',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 12,
    marginTop: 20,
  },
  browseButtonText: { color: '#FFFFFF', fontWeight: '800', fontSize: 15 },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  cardHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  cardTitle: { fontSize: 15, fontWeight: '800', color: '#0F172A' },
  itemsCountBadge: { fontSize: 12, fontWeight: '700', color: '#0D9488' },
  cardSubtitle: { fontSize: 12, color: '#64748B', marginBottom: 10 },
  itemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F8FAFC',
  },
  itemLeft: { flex: 1, paddingRight: 10 },
  itemNameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  itemName: { fontSize: 14, fontWeight: '700', color: '#0F172A', flex: 1 },
  customizationBox: { marginTop: 3, paddingLeft: 20 },
  customizationText: { fontSize: 11, color: '#64748B' },
  itemPrice: { fontSize: 13, fontWeight: '800', color: '#1E293B', marginTop: 4, paddingLeft: 20 },
  stepperContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F0FDFA',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#0D9488',
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  stepperBtn: { paddingHorizontal: 6 },
  stepperText: { color: '#0D9488', fontWeight: '800', fontSize: 16 },
  qtyText: { color: '#0D9488', fontWeight: '800', fontSize: 14, marginHorizontal: 8 },
  upsellRow: {
    backgroundColor: '#F8FAFC',
    borderRadius: 10,
    padding: 12,
  },
  upsellItem: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  upsellDetails: { flex: 1 },
  upsellBadgeRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  upsellName: { fontSize: 13, fontWeight: '700', color: '#0F172A' },
  upsellPrice: { fontSize: 12, color: '#64748B', marginTop: 2, paddingLeft: 18 },
  upsellAddBtn: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#16A34A',
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  upsellAddText: { color: '#16A34A', fontWeight: '800', fontSize: 12 },
  tipRow: { flexDirection: 'row', gap: 10, marginTop: 4 },
  tipChip: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    alignItems: 'center',
  },
  tipChipActive: { backgroundColor: '#F0FDFA', borderColor: '#0D9488' },
  tipText: { fontWeight: '700', color: '#475569' },
  tipTextActive: { color: '#0D9488', fontWeight: '800' },
  instructionInput: {
    backgroundColor: '#F8FAFC',
    borderRadius: 8,
    padding: 10,
    fontSize: 13,
    color: '#0F172A',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  billRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 },
  billLabel: { fontSize: 13, color: '#64748B' },
  billValue: { fontSize: 13, fontWeight: '600', color: '#0F172A' },
  grandTotalRow: {
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
    paddingTop: 10,
    marginTop: 6,
  },
  grandTotalLabel: { fontSize: 16, fontWeight: '800', color: '#0F172A' },
  grandTotalValue: { fontSize: 16, fontWeight: '900', color: '#0F172A' },
  checkoutBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  checkoutTotal: { fontSize: 18, fontWeight: '900', color: '#0F172A' },
  checkoutViewBill: { fontSize: 9, fontWeight: '800', color: '#0D9488', marginTop: 2, letterSpacing: 0.5 },
  payButton: {
    backgroundColor: '#0D9488',
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 12,
    shadowColor: '#0D9488',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
    elevation: 4,
  },
  payButtonText: { color: '#FFFFFF', fontWeight: '800', fontSize: 15 },
});
