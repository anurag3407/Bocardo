import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { OrderStatus } from '@bocardo/shared-types';

export default function OrderTrackingScreen() {
  const { id } = useLocalSearchParams();
  const router = useRouter();
  const [status, setStatus] = useState<OrderStatus>(OrderStatus.PREPARING);
  const [deliveryOtp] = useState('4819'); // Server-generated 4-digit handover OTP
  const [riderLocation, setRiderLocation] = useState({ lat: 12.9725, lng: 77.6415 });

  // Simulate real-time GPS pulses along the delivery route
  useEffect(() => {
    const timer = setInterval(() => {
      setRiderLocation((prev) => ({
        lat: prev.lat + 0.0002 * (Math.random() - 0.4),
        lng: prev.lng + 0.0002 * (Math.random() - 0.4),
      }));
    }, 3000);
    return () => clearInterval(timer);
  }, []);

  const steps = [
    { key: OrderStatus.PAID, label: 'Order Confirmed', done: true },
    { key: OrderStatus.ACCEPTED_BY_KITCHEN, label: 'Kitchen Accepted', done: true },
    { key: OrderStatus.PREPARING, label: 'Preparing Fresh Food', done: true },
    { key: OrderStatus.OUT_FOR_DELIVERY, label: 'Rider Out for Delivery', done: false },
    { key: OrderStatus.DELIVERED, label: 'Delivered', done: false },
  ];

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Estimated Time Header */}
        <View style={styles.etaHeader}>
          <Text style={styles.etaTitle}>Arriving in 18-22 mins</Text>
          <Text style={styles.etaSubtitle}>Chef is preparing your food with care</Text>
        </View>

        {/* Prominent 4-Digit Delivery Handover OTP Card */}
        <View style={styles.otpCard}>
          <View style={styles.otpHeaderRow}>
            <Text style={styles.otpShield}>🛡️</Text>
            <View style={styles.otpHeaderText}>
              <Text style={styles.otpTitle}>Delivery Handover OTP</Text>
              <Text style={styles.otpSub}>Share with rider ONLY when at your doorstep</Text>
            </View>
          </View>
          <View style={styles.otpCodeContainer}>
            {deliveryOtp.split('').map((digit, idx) => (
              <View key={idx} style={styles.otpDigitBox}>
                <Text style={styles.otpDigitText}>{digit}</Text>
              </View>
            ))}
          </View>
          <Text style={styles.otpWarning}>
            ⚠️ Delivery partner cannot complete order without this 4-digit code.
          </Text>
        </View>

        {/* Live GPS Map Simulation Box */}
        <View style={styles.mapContainer}>
          <View style={styles.mapPlaceholder}>
            <View style={styles.riderPin}>
              <Text style={styles.riderPinText}>🛵</Text>
              <View style={styles.pulseRing} />
            </View>
            <View style={styles.destPin}>
              <Text style={styles.destPinText}>📍</Text>
            </View>
            <Text style={styles.gpsStreamBadge}>
              LIVE GPS STREAMING • {riderLocation.lat.toFixed(4)}, {riderLocation.lng.toFixed(4)}
            </Text>
          </View>
        </View>

        {/* Multi-State Order Stepper */}
        <View style={styles.stepperCard}>
          <Text style={styles.stepperTitle}>Order Status</Text>
          {steps.map((step, idx) => (
            <View key={step.key} style={styles.stepRow}>
              <View style={styles.stepIndicatorCol}>
                <View
                  style={[
                    styles.stepDot,
                    step.done ? styles.stepDotDone : styles.stepDotPending,
                  ]}
                >
                  {step.done && <Text style={styles.stepCheck}>✓</Text>}
                </View>
                {idx < steps.length - 1 && (
                  <View
                    style={[
                      styles.stepLine,
                      step.done ? styles.stepLineDone : styles.stepLinePending,
                    ]}
                  />
                )}
              </View>
              <View style={styles.stepTextCol}>
                <Text
                  style={[
                    styles.stepLabel,
                    step.done ? styles.stepLabelDone : styles.stepLabelPending,
                  ]}
                >
                  {step.label}
                </Text>
              </View>
            </View>
          ))}
        </View>

        {/* Assigned Rider & Restaurant Card */}
        <View style={styles.partnerCard}>
          <View style={styles.partnerRow}>
            <View style={styles.partnerAvatar}>
              <Text style={styles.partnerAvatarText}>🛵</Text>
            </View>
            <View style={styles.partnerDetails}>
              <Text style={styles.partnerName}>Ramesh Kumar</Text>
              <Text style={styles.partnerMeta}>Delivery Partner • ★ 4.9 (1,240 trips)</Text>
            </View>
            <TouchableOpacity style={styles.callButton}>
              <Text style={styles.callButtonText}>📞 Call</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Back to Home Button */}
        <TouchableOpacity style={styles.homeButton} onPress={() => router.replace('/')}>
          <Text style={styles.homeButtonText}>Back to Restaurants</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  scrollContent: { padding: 16, paddingBottom: 40 },
  etaHeader: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 18,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  etaTitle: { fontSize: 22, fontWeight: '900', color: '#0F172A' },
  etaSubtitle: { fontSize: 13, color: '#64748B', marginTop: 4 },
  otpCard: {
    backgroundColor: '#FFFBEB',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1.5,
    borderColor: '#F59E0B',
    marginBottom: 14,
  },
  otpHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  otpShield: { fontSize: 24 },
  otpHeaderText: { flex: 1 },
  otpTitle: { fontSize: 15, fontWeight: '800', color: '#92400E' },
  otpSub: { fontSize: 11, color: '#B45309', marginTop: 1 },
  otpCodeContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 12,
    marginVertical: 14,
  },
  otpDigitBox: {
    width: 48,
    height: 54,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#D97706',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 2,
  },
  otpDigitText: { fontSize: 26, fontWeight: '900', color: '#92400E' },
  otpWarning: {
    fontSize: 11,
    color: '#92400E',
    textAlign: 'center',
    fontWeight: '600',
  },
  mapContainer: {
    borderRadius: 16,
    overflow: 'hidden',
    height: 180,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  mapPlaceholder: {
    flex: 1,
    backgroundColor: '#E2E8F0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  riderPin: {
    position: 'absolute',
    top: 60,
    left: 100,
    alignItems: 'center',
  },
  riderPinText: { fontSize: 28 },
  pulseRing: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#FC8019',
    opacity: 0.4,
    position: 'absolute',
    bottom: -6,
  },
  destPin: { position: 'absolute', top: 90, right: 90 },
  destPinText: { fontSize: 32 },
  gpsStreamBadge: {
    position: 'absolute',
    bottom: 10,
    backgroundColor: 'rgba(15, 23, 42, 0.85)',
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 8,
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  stepperCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  stepperTitle: { fontSize: 15, fontWeight: '800', color: '#0F172A', marginBottom: 14 },
  stepRow: { flexDirection: 'row', minHeight: 38 },
  stepIndicatorCol: { alignItems: 'center', width: 24 },
  stepDot: {
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepDotDone: { backgroundColor: '#16A34A' },
  stepDotPending: { backgroundColor: '#E2E8F0' },
  stepCheck: { color: '#FFFFFF', fontSize: 10, fontWeight: '900' },
  stepLine: { width: 2, flex: 1, marginVertical: 2 },
  stepLineDone: { backgroundColor: '#16A34A' },
  stepLinePending: { backgroundColor: '#E2E8F0' },
  stepTextCol: { flex: 1, paddingLeft: 12, justifyContent: 'center' },
  stepLabel: { fontSize: 13 },
  stepLabelDone: { fontWeight: '700', color: '#0F172A' },
  stepLabelPending: { color: '#94A3B8' },
  partnerCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 14,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  partnerRow: { flexDirection: 'row', alignItems: 'center' },
  partnerAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#FFF2E8',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  partnerAvatarText: { fontSize: 22 },
  partnerDetails: { flex: 1 },
  partnerName: { fontSize: 15, fontWeight: '800', color: '#0F172A' },
  partnerMeta: { fontSize: 12, color: '#64748B', marginTop: 2 },
  callButton: {
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#A7F3D0',
  },
  callButtonText: { color: '#059669', fontWeight: '800', fontSize: 12 },
  homeButton: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  homeButtonText: { color: '#475569', fontWeight: '700', fontSize: 14 },
});
