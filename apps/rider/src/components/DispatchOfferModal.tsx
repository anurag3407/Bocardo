import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Modal } from 'react-native';
import { formatPaiseToRupees, DispatchOfferPayload } from '@bocardo/shared-types';

interface DispatchOfferModalProps {
  visible: boolean;
  offer: DispatchOfferPayload | null;
  onAccept: (orderId: string) => void;
  onDecline: (orderId: string) => void;
}

export const DispatchOfferModal: React.FC<DispatchOfferModalProps> = ({
  visible,
  offer,
  onAccept,
  onDecline,
}) => {
  const [secondsRemaining, setSecondsRemaining] = useState(30);

  useEffect(() => {
    if (!visible || !offer) return;
    setSecondsRemaining(30);

    const interval = setInterval(() => {
      setSecondsRemaining((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          onDecline(offer.orderId); // Auto-decline when 30s expires
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [visible, offer]);

  if (!offer) return null;

  const progressPercent = (secondsRemaining / 30) * 100;

  return (
    <Modal visible={visible} transparent animationType="slide">
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          {/* 30s Countdown Header */}
          <View style={styles.timerHeader}>
            <View style={styles.timerBadge}>
              <Text style={styles.timerText}>⏱️ {secondsRemaining}s remaining</Text>
            </View>
            <Text style={styles.dispatchTag}>Sequential 1-to-1 Offer</Text>
          </View>

          {/* Progress Bar */}
          <View style={styles.progressBarBg}>
            <View style={[styles.progressBarFill, { width: `${progressPercent}%` }]} />
          </View>

          {/* Payout Banner */}
          <View style={styles.payoutCard}>
            <Text style={styles.payoutLabel}>Guaranteed Trip Payout</Text>
            <Text style={styles.payoutAmount}>{formatPaiseToRupees(offer.payoutPaise)}</Text>
            <Text style={styles.payoutSub}>Includes base fee + distance bonus</Text>
          </View>

          {/* Route Summary */}
          <View style={styles.routeCard}>
            <View style={styles.routeRow}>
              <Text style={styles.pinIcon}>🏬</Text>
              <View style={styles.routeInfo}>
                <Text style={styles.routeLabel}>PICKUP ({offer.distanceKm} km away)</Text>
                <Text style={styles.routeName}>{offer.restaurantName}</Text>
                <Text style={styles.routeAddress} numberOfLines={1}>{offer.restaurantAddress}</Text>
              </View>
            </View>

            <View style={styles.routeDivider} />

            <View style={styles.routeRow}>
              <Text style={styles.pinIcon}>📍</Text>
              <View style={styles.routeInfo}>
                <Text style={styles.routeLabel}>DELIVER TO CUSTOMER</Text>
                <Text style={styles.routeName}>{offer.deliveryAddress}</Text>
              </View>
            </View>
          </View>

          {/* Action Buttons */}
          <View style={styles.actionsRow}>
            <TouchableOpacity
              style={styles.declineButton}
              onPress={() => onDecline(offer.orderId)}
            >
              <Text style={styles.declineText}>DECLINE</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.acceptButton}
              onPress={() => onAccept(offer.orderId)}
            >
              <Text style={styles.acceptText}>ACCEPT ORDER ✓</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.85)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#1E293B',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    paddingBottom: 34,
  },
  timerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  timerBadge: {
    backgroundColor: '#7F1D1D',
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 8,
  },
  timerText: { color: '#FCA5A5', fontWeight: '900', fontSize: 13 },
  dispatchTag: { color: '#94A3B8', fontSize: 12, fontWeight: '700' },
  progressBarBg: {
    height: 6,
    backgroundColor: '#334155',
    borderRadius: 3,
    overflow: 'hidden',
    marginBottom: 16,
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: '#FC8019',
  },
  payoutCard: {
    backgroundColor: '#0F172A',
    borderRadius: 16,
    padding: 16,
    alignItems: 'center',
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#334155',
  },
  payoutLabel: { color: '#94A3B8', fontSize: 12, fontWeight: '700' },
  payoutAmount: { color: '#22C55E', fontSize: 32, fontWeight: '900', marginVertical: 4 },
  payoutSub: { color: '#64748B', fontSize: 11 },
  routeCard: {
    backgroundColor: '#0F172A',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#334155',
  },
  routeRow: { flexDirection: 'row', gap: 12 },
  pinIcon: { fontSize: 20 },
  routeInfo: { flex: 1 },
  routeLabel: { color: '#38BDF8', fontSize: 11, fontWeight: '800', letterSpacing: 0.5 },
  routeName: { color: '#FFFFFF', fontSize: 15, fontWeight: '800', marginTop: 2 },
  routeAddress: { color: '#94A3B8', fontSize: 12, marginTop: 2 },
  routeDivider: { height: 1, backgroundColor: '#334155', marginVertical: 12 },
  actionsRow: { flexDirection: 'row', gap: 12 },
  declineButton: {
    flex: 1,
    backgroundColor: '#334155',
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: 'center',
  },
  declineText: { color: '#94A3B8', fontWeight: '800', fontSize: 14 },
  acceptButton: {
    flex: 2,
    backgroundColor: '#16A34A',
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: 'center',
  },
  acceptText: { color: '#FFFFFF', fontWeight: '900', fontSize: 15 },
});
