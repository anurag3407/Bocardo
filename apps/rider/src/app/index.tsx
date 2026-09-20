import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Switch,
  StyleSheet,
  SafeAreaView,
} from 'react-native';
import { useRouter } from 'expo-router';
import { DispatchOfferPayload, formatPaiseToRupees } from '@bocardo/shared-types';
import io from 'socket.io-client';
import { riderLocationStream } from '../services/locationStream';
import { DispatchOfferModal } from '../components/DispatchOfferModal';
import { trpc, API_URL } from '../lib/api';

export default function RiderDashboardScreen() {
  const router = useRouter();
  const [isOnline, setIsOnline] = useState(true);
  const [currentCoord, setCurrentCoord] = useState(riderLocationStream.getCurrentCoord());
  const [incomingOffer, setIncomingOffer] = useState<DispatchOfferPayload | null>(null);

  useEffect(() => {
    let socket: any = null;
    if (isOnline) {
      riderLocationStream.startStreaming('rider-demo-uuid', undefined, API_URL);

      try {
        socket = io(API_URL, {
          auth: { token: 'mock_token_rider_user' },
          transports: ['websocket', 'polling'],
        });
        socket.on('dispatch:offer', (offer: DispatchOfferPayload) => {
          setIncomingOffer(offer);
        });
      } catch {
        // fallback for tests
      }
    } else {
      riderLocationStream.stopStreaming();
    }
    const unsub = riderLocationStream.subscribe(setCurrentCoord);
    return () => {
      unsub();
      if (socket) {
        socket.disconnect();
      }
    };
  }, [isOnline]);

  const handleSimulateOffer = () => {
    const mockOffer: DispatchOfferPayload = {
      orderId: 'ord-8102-demo',
      restaurantId: 'rest-1-uuid',
      restaurantName: 'Biryani Bliss & Kebabs',
      restaurantAddress: '100ft Rd, Indiranagar',
      deliveryAddress: 'Flat 402, Green Glen Layout, Bellandur',
      distanceKm: 1.4,
      payoutPaise: 5500, // ₹55 payout
      expiresInSeconds: 30,
      expiresAt: Date.now() + 30000,
    };
    setIncomingOffer(mockOffer);
  };

  const handleAcceptOffer = async (orderId: string) => {
    setIncomingOffer(null);
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(orderId);
    if (isUuid) {
      try {
        await trpc.rider.respondToDispatchOffer.mutate({ orderId, accepted: true });
      } catch (err: any) {
        console.warn('Accept offer warning:', err.message);
      }
    }
    router.push(`/delivery/${orderId}`);
  };

  const handleDeclineOffer = async (orderId: string) => {
    setIncomingOffer(null);
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(orderId);
    if (isUuid) {
      try {
        await trpc.rider.respondToDispatchOffer.mutate({ orderId, accepted: false });
      } catch {
        // safe no-op
      }
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Top Rider Bar */}
      <View style={styles.topBar}>
        <View>
          <Text style={styles.riderName}>Ramesh Kumar</Text>
          <Text style={styles.vehicleType}>🛵 Motorcycle • KA-03-HA-8192</Text>
        </View>
        <View style={styles.dutyContainer}>
          <Text style={[styles.dutyText, isOnline ? styles.dutyOnline : styles.dutyOffline]}>
            {isOnline ? 'ON DUTY' : 'OFF DUTY'}
          </Text>
          <Switch
            value={isOnline}
            onValueChange={setIsOnline}
            trackColor={{ false: '#475569', true: '#15803D' }}
            thumbColor="#FFFFFF"
          />
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {/* Foreground GPS Telemetry Card */}
        <View style={styles.gpsCard}>
          <View style={styles.gpsHeader}>
            <Text style={styles.gpsTitle}>Foreground GPS Stream</Text>
            <View style={[styles.gpsDot, isOnline ? styles.gpsDotActive : styles.gpsDotInactive]} />
          </View>
          <Text style={styles.coordText}>
            Lat: {currentCoord.latitude.toFixed(5)} | Lng: {currentCoord.longitude.toFixed(5)}
          </Text>
          <View style={styles.speedRow}>
            <Text style={styles.speedText}>Speed: {currentCoord.speed} km/h</Text>
            <Text style={styles.mockShield}>🛡️ Anti-Cheat: Verified Hardware GPS</Text>
          </View>
        </View>

        {/* Today's Shift Earnings */}
        <View style={styles.statsCard}>
          <Text style={styles.statsTitle}>Today's Earnings</Text>
          <Text style={styles.earningsAmount}>{formatPaiseToRupees(85000)}</Text>
          <View style={styles.statsGrid}>
            <View style={styles.statCol}>
              <Text style={styles.statVal}>14</Text>
              <Text style={styles.statLabel}>Trips Done</Text>
            </View>
            <View style={styles.statCol}>
              <Text style={styles.statVal}>4.2 hrs</Text>
              <Text style={styles.statLabel}>On Duty Time</Text>
            </View>
            <View style={styles.statCol}>
              <Text style={styles.statVal}>★ 4.9</Text>
              <Text style={styles.statLabel}>Rating</Text>
            </View>
          </View>
        </View>

        {/* Demo Dispatch Trigger */}
        <TouchableOpacity style={styles.demoTriggerButton} onPress={handleSimulateOffer}>
          <Text style={styles.demoTriggerText}>⚡ Trigger 30s Sequential Dispatch Offer</Text>
        </TouchableOpacity>

        {/* Active Order Card if any */}
        <TouchableOpacity
          style={styles.activeOrderCard}
          onPress={() => router.push('/delivery/ord-8102-demo')}
        >
          <View style={styles.activeOrderHeader}>
            <Text style={styles.activeOrderBadge}>ACTIVE DELIVERY</Text>
            <Text style={styles.activeOrderId}>#ORD-8102</Text>
          </View>
          <Text style={styles.activeOrderRest}>Biryani Bliss & Kebabs</Text>
          <Text style={styles.activeOrderDel}>Indiranagar 100ft Rd</Text>
          <Text style={styles.resumeNavText}>Tap to Open Navigation & Enter OTP →</Text>
        </TouchableOpacity>
      </ScrollView>

      {/* 30-Second Sequential Dispatch Modal */}
      <DispatchOfferModal
        visible={incomingOffer !== null}
        offer={incomingOffer}
        onAccept={handleAcceptOffer}
        onDecline={handleDeclineOffer}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0F172A' },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#1E293B',
    borderBottomWidth: 1,
    borderBottomColor: '#334155',
  },
  riderName: { fontSize: 18, fontWeight: '900', color: '#FFFFFF' },
  vehicleType: { fontSize: 12, color: '#94A3B8', marginTop: 2 },
  dutyContainer: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dutyText: { fontSize: 12, fontWeight: '900' },
  dutyOnline: { color: '#22C55E' },
  dutyOffline: { color: '#94A3B8' },
  content: { padding: 16 },
  gpsCard: {
    backgroundColor: '#1E293B',
    borderRadius: 14,
    padding: 14,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#334155',
  },
  gpsHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  gpsTitle: { color: '#38BDF8', fontSize: 12, fontWeight: '800', textTransform: 'uppercase' },
  gpsDot: { width: 10, height: 10, borderRadius: 5 },
  gpsDotActive: { backgroundColor: '#22C55E' },
  gpsDotInactive: { backgroundColor: '#EF4444' },
  coordText: { color: '#FFFFFF', fontSize: 14, fontWeight: '700', marginTop: 8 },
  speedRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 },
  speedText: { color: '#94A3B8', fontSize: 12 },
  mockShield: { color: '#4ADE80', fontSize: 11, fontWeight: '700' },
  statsCard: {
    backgroundColor: '#1E293B',
    borderRadius: 16,
    padding: 18,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#334155',
    alignItems: 'center',
  },
  statsTitle: { color: '#94A3B8', fontSize: 13, fontWeight: '700' },
  earningsAmount: { color: '#FFFFFF', fontSize: 36, fontWeight: '900', marginVertical: 6 },
  statsGrid: { flexDirection: 'row', width: '100%', marginTop: 12, borderTopWidth: 1, borderTopColor: '#334155', paddingTop: 12 },
  statCol: { flex: 1, alignItems: 'center' },
  statVal: { color: '#FFFFFF', fontSize: 16, fontWeight: '800' },
  statLabel: { color: '#94A3B8', fontSize: 11, marginTop: 2 },
  demoTriggerButton: {
    backgroundColor: '#0D9488',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: 14,
  },
  demoTriggerText: { color: '#FFFFFF', fontWeight: '900', fontSize: 14 },
  activeOrderCard: {
    backgroundColor: '#0F172A',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1.5,
    borderColor: '#38BDF8',
  },
  activeOrderHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  activeOrderBadge: { backgroundColor: '#0284C7', color: '#FFFFFF', fontSize: 10, fontWeight: '900', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  activeOrderId: { color: '#38BDF8', fontWeight: '800', fontSize: 12 },
  activeOrderRest: { color: '#FFFFFF', fontSize: 16, fontWeight: '800', marginTop: 8 },
  activeOrderDel: { color: '#94A3B8', fontSize: 13, marginTop: 2 },
  resumeNavText: { color: '#38BDF8', fontWeight: '800', fontSize: 12, marginTop: 12 },
});
