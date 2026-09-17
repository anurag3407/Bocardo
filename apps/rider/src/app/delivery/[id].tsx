import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  StyleSheet,
  SafeAreaView,
  Alert,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { maskPhoneNumber } from '@bocardo/shared-types';

type DeliveryStage = 'TO_RESTAURANT' | 'PICKED_UP' | 'AT_DOORSTEP' | 'COMPLETED';

export default function ActiveDeliveryScreen() {
  const { id } = useLocalSearchParams();
  const router = useRouter();
  const [stage, setStage] = useState<DeliveryStage>('TO_RESTAURANT');
  const [otpInput, setOtpInput] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  const maskedCustomerPhone = maskPhoneNumber('+919876543210');

  const handleVerifyOtp = () => {
    if (otpInput !== '4819') {
      setErrorMsg('❌ Incorrect OTP. Please ask the customer to check their screen.');
      return;
    }

    setStage('COMPLETED');
    Alert.alert(
      '🎉 Delivery Completed!',
      'Delivery verified with 4-digit OTP. Payout of ₹55.00 credited to your wallet!',
      [{ text: 'Return to Dashboard', onPress: () => router.replace('/') }]
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        {/* Top Order Badge */}
        <View style={styles.orderBadgeRow}>
          <Text style={styles.orderBadge}>ORDER #{String(id).slice(0, 8).toUpperCase()}</Text>
          <Text style={styles.payoutBadge}>Payout: ₹55.00</Text>
        </View>

        {/* Stage 1: Pickup at Restaurant */}
        <View style={[styles.stageCard, stage === 'TO_RESTAURANT' && styles.stageActive]}>
          <View style={styles.stageHeader}>
            <Text style={styles.stageTitle}>1. Pickup from Restaurant</Text>
            {stage !== 'TO_RESTAURANT' && <Text style={styles.doneBadge}>✓ PICKED UP</Text>}
          </View>
          <Text style={styles.destName}>Biryani Bliss & Kebabs</Text>
          <Text style={styles.destAddress}>100 Feet Rd, HAL 2nd Stage, Indiranagar</Text>
          <Text style={styles.itemSummary}>Items: 2x Hyderabadi Dum Biryani, 1x Raita</Text>

          {stage === 'TO_RESTAURANT' && (
            <TouchableOpacity
              style={styles.actionBtn}
              onPress={() => setStage('PICKED_UP')}
            >
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
          <Text style={styles.destName}>Anurag Mishra</Text>
          <Text style={styles.destAddress}>Indiranagar 100ft Rd, Bangalore 560038</Text>

          {/* Masked Customer Phone Protection */}
          <View style={styles.phoneBox}>
            <Text style={styles.phoneLabel}>Customer Contact (Masked):</Text>
            <Text style={styles.phoneValue}>{maskedCustomerPhone}</Text>
          </View>

          {stage === 'PICKED_UP' && (
            <TouchableOpacity
              style={styles.actionBtn}
              onPress={() => setStage('AT_DOORSTEP')}
            >
              <Text style={styles.actionBtnText}>ARRIVED AT DOORSTEP 🚪</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Stage 3: Anti-Fraud Handover OTP Verification */}
        {stage === 'AT_DOORSTEP' && (
          <View style={styles.otpCard}>
            <Text style={styles.otpTitle}>🔒 Anti-Fraud Handover Verification</Text>
            <Text style={styles.otpSub}>
              Ask the customer for the 4-digit OTP shown on their Bocardo app.
            </Text>

            <TextInput
              style={styles.otpInput}
              placeholder="Enter 4-Digit OTP (e.g. 4819)"
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

            <TouchableOpacity style={styles.verifyBtn} onPress={handleVerifyOtp}>
              <Text style={styles.verifyBtnText}>VERIFY OTP & COMPLETE DELIVERY ✓</Text>
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
  stageActive: { borderColor: '#FC8019' },
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
    backgroundColor: '#FC8019',
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
