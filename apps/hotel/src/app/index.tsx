import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import { OrderStatus, formatPaiseToRupees } from '@bocardo/shared-types';
import { kitchenAlarmService } from '../services/alarm';
import { thermalPrinterService } from '../services/printer';

interface KotOrder {
  id: string;
  customerName: string;
  items: Array<{ name: string; quantity: number; notes?: string }>;
  totalAmountPaise: number;
  status: OrderStatus;
  createdAt: string;
  secondsRemaining: number; // 120-second Ghost Restaurant countdown
  riderName?: string;
}

const INITIAL_ORDERS: KotOrder[] = [
  {
    id: 'ord-8102',
    customerName: 'Anurag Mishra',
    items: [
      { name: 'Hyderabadi Dum Biryani', quantity: 2, notes: 'Extra spicy please' },
      { name: 'Burani Garlic Raita', quantity: 1 },
      { name: 'Gulab Jamun (2 Pcs)', quantity: 1 },
    ],
    totalAmountPaise: 78000,
    status: OrderStatus.PAID, // Incoming
    createdAt: '12:42 PM',
    secondsRemaining: 114,
  },
  {
    id: 'ord-8099',
    customerName: 'Priya Sharma',
    items: [
      { name: 'Paneer Tikka Biryani', quantity: 1 },
      { name: 'Burani Garlic Raita', quantity: 1 },
    ],
    totalAmountPaise: 34000,
    status: OrderStatus.PREPARING,
    createdAt: '12:35 PM',
    secondsRemaining: 0,
  },
  {
    id: 'ord-8095',
    customerName: 'Vikram Rao',
    items: [{ name: 'Hyderabadi Dum Biryani', quantity: 1 }],
    totalAmountPaise: 32000,
    status: OrderStatus.READY_FOR_PICKUP,
    createdAt: '12:28 PM',
    secondsRemaining: 0,
    riderName: 'Ramesh Kumar (🛵 Arriving in 2m)',
  },
];

export default function KotBoardScreen() {
  const [orders, setOrders] = useState<KotOrder[]>(INITIAL_ORDERS);

  // Ghost restaurant countdown timer and alarm trigger
  useEffect(() => {
    // If any order is in PAID state, trigger alarm
    const hasIncoming = orders.some((o) => o.status === OrderStatus.PAID);
    if (hasIncoming) {
      kitchenAlarmService.startAlarm();
    } else {
      kitchenAlarmService.stopAlarm();
    }

    const timer = setInterval(() => {
      setOrders((prev) =>
        prev
          .map((order) => {
            if (order.status === OrderStatus.PAID && order.secondsRemaining > 0) {
              return { ...order, secondsRemaining: order.secondsRemaining - 1 };
            }
            return order;
          })
          .filter((order) => {
            // If timer expires, simulate ghost restaurant auto-cancellation
            if (order.status === OrderStatus.PAID && order.secondsRemaining <= 1) {
              console.log(`⏱️ Auto-refund executed for Order ${order.id}`);
              return false;
            }
            return true;
          })
      );
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  const handleAcceptOrder = (order: KotOrder) => {
    // 1. Stop audio alarm
    kitchenAlarmService.stopAlarm();

    // 2. Print KOT ticket via ESC/POS
    thermalPrinterService.printKot({
      id: `kot-${order.id}`,
      orderId: order.id,
      items: order.items,
      customerName: order.customerName,
      orderTime: order.createdAt,
    });

    // 3. Move status to PREPARING
    setOrders((prev) =>
      prev.map((o) =>
        o.id === order.id ? { ...o, status: OrderStatus.PREPARING } : o
      )
    );
  };

  const handleFoodReady = (order: KotOrder) => {
    setOrders((prev) =>
      prev.map((o) =>
        o.id === order.id
          ? {
              ...o,
              status: OrderStatus.READY_FOR_PICKUP,
              riderName: 'Assigning nearest rider (4km)...',
            }
          : o
      )
    );
  };

  const incomingOrders = orders.filter((o) => o.status === OrderStatus.PAID);
  const preparingOrders = orders.filter((o) => o.status === OrderStatus.PREPARING);
  const readyOrders = orders.filter((o) => o.status === OrderStatus.READY_FOR_PICKUP);
  const outOrders = orders.filter((o) => o.status === OrderStatus.OUT_FOR_DELIVERY);

  return (
    <View style={styles.boardContainer}>
      {/* Column 1: Incoming Orders */}
      <View style={[styles.column, styles.colIncoming]}>
        <View style={styles.colHeader}>
          <Text style={styles.colTitle}>🔔 Incoming Orders</Text>
          <View style={styles.countBadge}>
            <Text style={styles.countText}>{incomingOrders.length}</Text>
          </View>
        </View>
        <ScrollView style={styles.cardList}>
          {incomingOrders.map((order) => (
            <View key={order.id} style={styles.orderCard}>
              <View style={styles.cardHeaderRow}>
                <Text style={styles.orderId}>#{order.id.toUpperCase()}</Text>
                <View style={styles.countdownBadge}>
                  <Text style={styles.countdownText}>⏱️ {order.secondsRemaining}s</Text>
                </View>
              </View>
              <Text style={styles.customerName}>{order.customerName}</Text>
              <View style={styles.divider} />
              {order.items.map((item, idx) => (
                <Text key={idx} style={styles.itemLine}>
                  <Text style={styles.itemQty}>{item.quantity}x </Text>
                  {item.name}
                  {item.notes ? ` (${item.notes})` : ''}
                </Text>
              ))}
              <View style={styles.divider} />
              <View style={styles.priceRow}>
                <Text style={styles.priceLabel}>Total:</Text>
                <Text style={styles.priceVal}>{formatPaiseToRupees(order.totalAmountPaise)}</Text>
              </View>
              <TouchableOpacity
                style={styles.acceptButton}
                onPress={() => handleAcceptOrder(order)}
              >
                <Text style={styles.acceptButtonText}>ACCEPT & PRINT KOT 🖨️</Text>
              </TouchableOpacity>
            </View>
          ))}
        </ScrollView>
      </View>

      {/* Column 2: Preparing */}
      <View style={styles.column}>
        <View style={styles.colHeader}>
          <Text style={styles.colTitle}>🍳 Preparing</Text>
          <View style={styles.countBadge}>
            <Text style={styles.countText}>{preparingOrders.length}</Text>
          </View>
        </View>
        <ScrollView style={styles.cardList}>
          {preparingOrders.map((order) => (
            <View key={order.id} style={styles.orderCard}>
              <Text style={styles.orderId}>#{order.id.toUpperCase()}</Text>
              <Text style={styles.customerName}>{order.customerName}</Text>
              <View style={styles.divider} />
              {order.items.map((item, idx) => (
                <Text key={idx} style={styles.itemLine}>
                  <Text style={styles.itemQty}>{item.quantity}x </Text>
                  {item.name}
                </Text>
              ))}
              <View style={styles.divider} />
              <TouchableOpacity
                style={styles.readyButton}
                onPress={() => handleFoodReady(order)}
              >
                <Text style={styles.readyButtonText}>MARK FOOD READY ✓</Text>
              </TouchableOpacity>
            </View>
          ))}
        </ScrollView>
      </View>

      {/* Column 3: Ready for Pickup */}
      <View style={styles.column}>
        <View style={styles.colHeader}>
          <Text style={styles.colTitle}>📦 Ready for Pickup</Text>
          <View style={styles.countBadge}>
            <Text style={styles.countText}>{readyOrders.length}</Text>
          </View>
        </View>
        <ScrollView style={styles.cardList}>
          {readyOrders.map((order) => (
            <View key={order.id} style={styles.orderCard}>
              <Text style={styles.orderId}>#{order.id.toUpperCase()}</Text>
              <Text style={styles.customerName}>{order.customerName}</Text>
              <View style={styles.riderBanner}>
                <Text style={styles.riderText}>🛵 {order.riderName || 'Rider Assigned'}</Text>
              </View>
              <TouchableOpacity
                style={styles.reprintButton}
                onPress={() =>
                  thermalPrinterService.reprintKot({
                    id: `kot-dup-${order.id}`,
                    orderId: order.id,
                    items: order.items,
                    customerName: order.customerName,
                    orderTime: order.createdAt,
                  })
                }
              >
                <Text style={styles.reprintText}>Reprint Duplicate KOT 🖨️</Text>
              </TouchableOpacity>
            </View>
          ))}
        </ScrollView>
      </View>

      {/* Column 4: Out for Delivery */}
      <View style={styles.column}>
        <View style={styles.colHeader}>
          <Text style={styles.colTitle}>🚀 Dispatched</Text>
          <View style={styles.countBadge}>
            <Text style={styles.countText}>{outOrders.length}</Text>
          </View>
        </View>
        <ScrollView style={styles.cardList}>
          {outOrders.length === 0 ? (
            <Text style={styles.emptyColText}>No dispatched orders yet</Text>
          ) : (
            outOrders.map((order) => (
              <View key={order.id} style={styles.orderCard}>
                <Text style={styles.orderId}>#{order.id.toUpperCase()}</Text>
                <Text style={styles.customerName}>{order.customerName}</Text>
                <Text style={styles.dispatchedTag}>Handed over to Rider</Text>
              </View>
            ))
          )}
        </ScrollView>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  boardContainer: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: '#0F172A',
    padding: 12,
    gap: 12,
  },
  column: {
    flex: 1,
    backgroundColor: '#1E293B',
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: '#334155',
  },
  colIncoming: { borderColor: '#F59E0B' },
  colHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  colTitle: { fontSize: 15, fontWeight: '800', color: '#F1F5F9' },
  countBadge: {
    backgroundColor: '#334155',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 12,
  },
  countText: { color: '#FFFFFF', fontWeight: '800', fontSize: 12 },
  cardList: { flex: 1 },
  orderCard: {
    backgroundColor: '#0F172A',
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#334155',
  },
  cardHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  orderId: { fontSize: 14, fontWeight: '800', color: '#38BDF8' },
  countdownBadge: {
    backgroundColor: '#7F1D1D',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  countdownText: { color: '#FCA5A5', fontWeight: '900', fontSize: 12 },
  customerName: { fontSize: 15, fontWeight: '700', color: '#FFFFFF', marginTop: 4 },
  divider: { height: 1, backgroundColor: '#334155', marginVertical: 10 },
  itemLine: { color: '#CBD5E1', fontSize: 13, marginBottom: 4 },
  itemQty: { color: '#38BDF8', fontWeight: '800' },
  priceRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 },
  priceLabel: { color: '#94A3B8', fontSize: 13 },
  priceVal: { color: '#FFFFFF', fontWeight: '800', fontSize: 14 },
  acceptButton: {
    backgroundColor: '#16A34A',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  acceptButtonText: { color: '#FFFFFF', fontWeight: '900', fontSize: 13 },
  readyButton: {
    backgroundColor: '#0D9488',
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
  },
  readyButtonText: { color: '#FFFFFF', fontWeight: '800', fontSize: 13 },
  riderBanner: {
    backgroundColor: '#1E293B',
    padding: 8,
    borderRadius: 6,
    marginVertical: 8,
  },
  riderText: { color: '#38BDF8', fontSize: 12, fontWeight: '700' },
  reprintButton: {
    backgroundColor: '#334155',
    paddingVertical: 8,
    borderRadius: 6,
    alignItems: 'center',
  },
  reprintText: { color: '#CBD5E1', fontSize: 12, fontWeight: '700' },
  emptyColText: { color: '#64748B', textAlign: 'center', marginTop: 30, fontSize: 13 },
  dispatchedTag: { color: '#4ADE80', fontSize: 12, fontWeight: '700', marginTop: 8 },
});
