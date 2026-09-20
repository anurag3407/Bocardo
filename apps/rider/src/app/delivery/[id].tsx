import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  StyleSheet,
  SafeAreaView,
  Alert,
  Switch,
  ActivityIndicator,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { maskPhoneNumber, OrderStatus, formatPaiseToRupees } from '@bocardo/shared-types';
import { trpc } from '../../lib/api';

type DeliveryStage = 'TO_RESTAURANT' | 'PICKED_UP' | 'AT_DOORSTEP' | 'COMPLETED';

export default function ActiveDeliveryScreen() {
  const { id } = useLocalSearchParams();
  const router = useRouter();
  const [stage, setStage] = useState<DeliveryStage>('TO_RESTAURANT');
  const [otpInput, setOtpInput] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [isGateHandover, setIsGateHandover] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [orderData, setOrderData] = useState<any>(null);

  const orderId = String(id);
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(orderId);

  useEffect(() => {
    if (isUuid) {
      trpc.order.getById
        .query({ orderId })
        .then((order: any) => {
          setOrderData(order);
          if (order.status === OrderStatus.OUT_FOR_DELIVERY) {
            setStage('PICKED_UP');
          } else if (order.status === OrderStatus.DELIVERED) {
            setStage('COMPLETED');
          }
        })
        .catch(() => {
          // fallback
        });
    }
  }, [orderId]);

  const handleConfirmPickup = async () => {
    if (isUuid) {
      try {
        await trpc.order.updateStatus.mutate({
          orderId,
          status: OrderStatus.OUT_FOR_DELIVERY,
        });
      } catch (err: any) {
        console.warn('Status update warning:', err.message);
      }
    }
    setStage('PICKED_UP');
  };

  const handleVerifyOtp = async () => {
    if (!otpInput || otpInput.length !== 4) {
      setErrorMsg('Please enter the complete 4-digit OTP.');
      return;
    }

    setIsVerifying(true);
    setErrorMsg('');

    try {
      if (isUuid) {
        await trpc.order.verifyDeliveryOtp.mutate({
          orderId,
          otp: otpInput,
          isGateHandover,
        });
      } else {
        // Fallback for offline demo string order IDs
        if (otpInput !== '4819') {
          throw new Error('Incorrect OTP. Please ask customer to check their screen.');
        }
      }

      setStage('COMPLETED');
      Alert.alert(
        '🎉 Delivery Completed!',
        'Delivery verified with 4-digit OTP. Payout has been credited to your rider account!',
        [{ text: 'Return to Dashboard', onPress: () => router.replace('/') }]
      );
    } catch (err: any) {
      setErrorMsg(err.message || 'Verification failed. Please check OTP.');
    } finally {
      setIsVerifying(false);
    }
  };

  const displayPhone = orderData?.customerPhone || maskPhoneNumber('+919876543210');
  const restaurantName = orderData?.restaurantName || 'Biryani Bliss & Kebabs';
  const restaurantAddress = orderData?.restaurantAddress || '100 Feet Rd, HAL 2nd Stage, Indiranagar';
  const deliveryAddress = orderData?.deliveryAddress || 'Indiranagar 100ft Rd, Bangalore 560038';
  const payoutText = orderData?.deliveryFeePaise ? formatPaiseToRupees(orderData.deliveryFeePaise) : '₹55.00';

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        {/* Top Order Badge */}
        <View style={styles.orderBadgeRow}>
          <Text style={styles.orderBadge}>ORDER #{orderId.slice(0, 8).toUpperCase()}</Text>
          <Text style={styles.payoutBadge}>Payout: {payoutText}</Text>
        </View>

        {/* Stage 1: Pickup at Restaurant */}
        <View style={[styles.stageCard, stage === 'TO_RESTAURANT' && styles.stageActive]}>
          <View style={styles.stageHeader}>
            <Text style={styles.stageTitle}>1. Pickup from Restaurant</Text>
            {stage !== 'TO_RESTAURANT' && <Text style={styles.doneBadge}>✓ PICKED UP</Text>}
          </View>
          <Text style={styles.destName}>{restaurantName}</Text>
          <Text style={styles.destAddress}>{restaurantAddress}</Text>

          {stage === 'TO_RESTAURANT' && (
            <TouchableOpacity style={styles.actionBtn} onPress={handleConfirmPickup}>
              <Text style={styles.actionBtnText}>CONFIRM FOOD PICKED UP →</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Stage 2: Deliver to Customer */}
        <View
          style={[
            styles.stageCard,
            (stage === 'PICKED_UP' || stage === 'AT_DOORSTEP') && styles.stageActive,
          ]}
        >
          <View style={styles.stageHeader}>
            <Text style={styles.stageTitle}>2. Deliver to Customer</Text>
            {stage === 'COMPLETED' && <Text style={styles.doneBadge}>✓ DELIVERED</Text>}
          </View>
          <Text style={styles.destAddress}>{deliveryAddress}</Text>

          {/* Masked Customer Phone Protection */}
          <View style={styles.phoneBox}>
            <Text style={styles.phoneLabel}>Customer Contact (Masked):</Text>
            <Text style={styles.phoneValue}>{displayPhone}</Text>
          </View>

          {stage === 'PICKED_UP' && (
            <TouchableOpacity style={styles.actionBtn} onPress={() => setStage('AT_DOORSTEP')}>
              <Text style={styles.actionBtnText}>ARRIVED AT DOORSTEP / GATE 🚪</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Stage 3: Anti-Fraud Handover OTP Verification */}
        {stage === 'AT_DOORSTEP' && (
          <View style={styles.otpCard}>
            <Text style={styles.otpTitle}>🔒 Anti-Fraud Handover Verification</Text>
            <Text style={styles.otpSub}>
              Ask the customer for the 4-digit OTP shown on their Bocardo app screen.
            </Text>

            {/* Society Gate Handover Toggle (300m Geofence) */}
            <View style={styles.gateRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.gateLabel}>Delivering at Society Gate (300m tolerance)</Text>
                <Text style={styles.gateSub}>Enable if security restricts entering apartment towers</Text>
              </View>
              <Switch
                value={isGateHandover}
                onValueChange={setIsGateHandover}
                trackColor={{ false: '#475569', true: '#0284C7' }}
                thumbColor="#FFFFFF"
              />
            </View>

            <TextInput
              style={styles.otpInput}
              placeholder="Enter 4-Digit OTP"
              placeholderTextColor="#64748B"
              keyboardType="number-pad"
              maxLength={4}
              value={otpInput}
              onChangeText={(t) => {
                setOtpInput(t);
                setErrorMsg('');
              }}
            />

            {errorMsg ? <Text style={styles.errorText}>{errorMsg}</Text> : null}

            <TouchableOpacity
              style={[styles.verifyBtn, isVerifying && { opacity: 0.7 }]}
              onPress={handleVerifyOtp}
              disabled={isVerifying}
            >
              {isVerifying ? (
                <ActivityIndicator color="#FFF" />
              ) : (
                <Text style={styles.verifyBtnText}>VERIFY OTP & COMPLETE DELIVERY ✓</Text>
              )}
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0F172A' },
  content: { padding: 16 },
  orderBadgeRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 14 },
  orderBadge: { color: '#38BDF8', fontWeight: '900', fontSize: 13 },
  payoutBadge: { color: '#22C55E', fontWeight: '900', fontSize: 14 },
  stageCard: {
    backgroundColor: '#1E293B',
    borderRadius: 16,
    padding: 16,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#334155',
  },
  stageActive: { borderColor: '#0D9488' },
  stageHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  stageTitle: { fontSize: 13, fontWeight: '800', color: '#94A3B8', textTransform: 'uppercase' },
  doneBadge: { color: '#22C55E', fontWeight: '900', fontSize: 12 },
  destName: { fontSize: 18, fontWeight: '900', color: '#FFFFFF', marginTop: 8 },
  destAddress: { fontSize: 13, color: '#94A3B8', marginTop: 4 },
  itemSummary: { fontSize: 12, color: '#CBD5E1', marginTop: 8, fontStyle: 'italic' },
  phoneBox: {
    backgroundColor: '#0F172A',
    borderRadius: 8,
    padding: 10,
    marginTop: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  phoneLabel: { color: '#64748B', fontSize: 12 },
  phoneValue: { color: '#38BDF8', fontWeight: '800', fontSize: 12 },
  actionBtn: {
    backgroundColor: '#0D9488',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 14,
  },
  actionBtnText: { color: '#FFFFFF', fontWeight: '900', fontSize: 14 },
  otpCard: {
    backgroundColor: '#FFFBEB',
    borderRadius: 16,
    padding: 18,
    borderWidth: 2,
    borderColor: '#F59E0B',
    marginTop: 6,
  },
  otpTitle: { fontSize: 16, fontWeight: '900', color: '#92400E' },
  otpSub: { fontSize: 12, color: '#B45309', marginTop: 4, marginBottom: 14 },
  gateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FEF3C7',
    padding: 10,
    borderRadius: 8,
    marginBottom: 12,
  },
  gateLabel: { fontSize: 13, fontWeight: '700', color: '#78350F' },
  gateSub: { fontSize: 11, color: '#92400E', marginTop: 2 },
  otpInput: {
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    padding: 14,
    fontSize: 18,
    fontWeight: '900',
    color: '#0F172A',
    textAlign: 'center',
    borderWidth: 1.5,
    borderColor: '#D97706',
    letterSpacing: 4,
  },
  errorText: { color: '#DC2626', fontSize: 12, fontWeight: '700', marginTop: 8, textAlign: 'center' },
  verifyBtn: {
    backgroundColor: '#16A34A',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 14,
  },
  verifyBtnText: { color: '#FFFFFF', fontWeight: '900', fontSize: 14 },
});
