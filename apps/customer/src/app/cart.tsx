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
import { formatPaiseToRupees } from '@bocardo/shared-types';
import { cartStore, CartItem } from '../lib/cart';

export default function CartScreen() {
  const router = useRouter();
  const [items, setItems] = useState<CartItem[]>([]);
  const [tipPaise, setTipPaise] = useState(3000); // ₹30 default tip
  const [instructions, setInstructions] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    setItems(cartStore.getItems());
    return cartStore.subscribe(() => setItems(cartStore.getItems()));
  }, []);

  const totals = cartStore.getTotals();
  const grandTotalPaise = totals.totalAmountPaise + tipPaise;

  const handleCheckout = async () => {
    if (items.length === 0) return;
    setIsSubmitting(true);

    try {
      // Simulate/call checkout API
      const simulatedOrderId = `ord-${Date.now()}`;
      // In local dev, clear cart and navigate to live tracking
      cartStore.clear();
      router.replace(`/orders/${simulatedOrderId}`);
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
        <Text style={styles.emptySubtitle}>Explore top restaurants around you and add delicious dishes!</Text>
        <TouchableOpacity style={styles.browseButton} onPress={() => router.back()}>
          <Text style={styles.browseButtonText}>Browse Restaurants</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Restaurant Badge */}
        <View style={styles.card}>
          <Text style={styles.restName}>{cartStore.getRestaurantName()}</Text>
          <Text style={styles.restDeliveryTime}>Delivery to: Indiranagar 100ft Rd (25-30 mins)</Text>
        </View>

        {/* Cart Items List */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Your Items</Text>
          {items.map((item) => (
            <View key={item.dishId} style={styles.itemRow}>
              <View style={styles.itemInfo}>
                <Text style={styles.itemName}>{item.name}</Text>
                <Text style={styles.itemPrice}>
                  {formatPaiseToRupees(item.pricePaise * item.quantity)}
                </Text>
              </View>
              <View style={styles.stepperContainer}>
                <TouchableOpacity
                  style={styles.stepperBtn}
                  onPress={() => cartStore.removeItem(item.dishId)}
                >
                  <Text style={styles.stepperText}>−</Text>
                </TouchableOpacity>
                <Text style={styles.qtyText}>{item.quantity}</Text>
                <TouchableOpacity
                  style={styles.stepperBtn}
                  onPress={() => cartStore.addItem(item)}
                >
                  <Text style={styles.stepperText}>+</Text>
                </TouchableOpacity>
              </View>
            </View>
          ))}
        </View>

        {/* Frequently Bought Together Upsell Tray */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Complete Your Meal ✨</Text>
          <Text style={styles.cardSubtitle}>Frequently ordered together</Text>
          <View style={styles.upsellRow}>
            <View style={styles.upsellItem}>
              <View>
                <Text style={styles.upsellName}>Burani Garlic Raita</Text>
                <Text style={styles.upsellPrice}>{formatPaiseToRupees(6000)}</Text>
              </View>
              <TouchableOpacity
                style={styles.upsellAddBtn}
                onPress={() =>
                  cartStore.addItem({
                    dishId: 'dish-3-uuid',
                    name: 'Burani Garlic Raita',
                    pricePaise: 6000,
                    isVeg: true,
                    restaurantId: cartStore.getRestaurantId()!,
                    restaurantName: cartStore.getRestaurantName()!,
                  })
                }
              >
                <Text style={styles.upsellAddText}>+ ADD</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>

        {/* Tip Your Delivery Partner */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Delivery Partner Tip</Text>
          <Text style={styles.cardSubtitle}>100% of the tip goes directly to your delivery partner</Text>
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

        {/* Cooking Instructions */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Delivery Notes</Text>
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
          <Text style={styles.cardTitle}>Bill Summary</Text>
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
            <Text style={styles.billLabel}>Platform Service Fee</Text>
            <Text style={styles.billValue}>{formatPaiseToRupees(totals.platformFeePaise)}</Text>
          </View>
          <View style={styles.billRow}>
            <Text style={styles.billLabel}>Service GST (18% on convenience)</Text>
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

      {/* Pay Now Button */}
      <View style={styles.checkoutBar}>
        <View>
          <Text style={styles.checkoutTotal}>{formatPaiseToRupees(grandTotalPaise)}</Text>
          <Text style={styles.checkoutViewBill}>VIEW DETAILED BILL</Text>
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
  container: { flex: 1, backgroundColor: '#F1F5F9' },
  scrollContent: { padding: 16, paddingBottom: 110 },
  emptyContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  emptyIcon: { fontSize: 64, marginBottom: 12 },
  emptyTitle: { fontSize: 20, fontWeight: '800', color: '#0F172A' },
  emptySubtitle: { fontSize: 14, color: '#64748B', textAlign: 'center', marginTop: 6 },
  browseButton: {
    backgroundColor: '#FC8019',
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
  restName: { fontSize: 17, fontWeight: '800', color: '#0F172A' },
  restDeliveryTime: { fontSize: 13, color: '#64748B', marginTop: 4 },
  cardTitle: { fontSize: 15, fontWeight: '800', color: '#0F172A', marginBottom: 8 },
  cardSubtitle: { fontSize: 12, color: '#64748B', marginBottom: 10 },
  itemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F8FAFC',
  },
  itemInfo: { flex: 1 },
  itemName: { fontSize: 14, fontWeight: '700', color: '#0F172A' },
  itemPrice: { fontSize: 13, fontWeight: '800', color: '#334155', marginTop: 2 },
  stepperContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF2E8',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#FC8019',
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  stepperBtn: { paddingHorizontal: 6 },
  stepperText: { color: '#FC8019', fontWeight: '800', fontSize: 16 },
  qtyText: { color: '#FC8019', fontWeight: '800', fontSize: 14, marginHorizontal: 8 },
  upsellRow: {
    backgroundColor: '#F8FAFC',
    borderRadius: 10,
    padding: 12,
  },
  upsellItem: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  upsellName: { fontSize: 14, fontWeight: '700', color: '#0F172A' },
  upsellPrice: { fontSize: 12, color: '#64748B', marginTop: 2 },
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
  tipChipActive: { backgroundColor: '#FFF2E8', borderColor: '#FC8019' },
  tipText: { fontWeight: '700', color: '#475569' },
  tipTextActive: { color: '#FC8019' },
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
  grandTotalValue: { fontSize: 16, fontWeight: '800', color: '#0F172A' },
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
  checkoutViewBill: { fontSize: 10, fontWeight: '800', color: '#FC8019', marginTop: 2 },
  payButton: {
    backgroundColor: '#FC8019',
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 12,
  },
  payButtonText: { color: '#FFFFFF', fontWeight: '800', fontSize: 15 },
});
