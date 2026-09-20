import React from 'react';
import { View, Text, Modal, TouchableOpacity, StyleSheet } from 'react-native';
import { formatPaiseToRupees } from '@bocardo/shared-types';
import { CartItem } from '../lib/cart';

interface Props {
  visible: boolean;
  dishName: string;
  lastItem: CartItem | null;
  onClose: () => void;
  onRepeatLast: () => void;
  onChooseNew: () => void;
}

export const RepeatCustomizationModal: React.FC<Props> = ({
  visible,
  dishName,
  lastItem,
  onClose,
  onRepeatLast,
  onChooseNew,
}) => {
  if (!lastItem) return null;

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <Text style={styles.title}>Repeat last customization?</Text>
          <Text style={styles.dishName}>{dishName}</Text>

          <View style={styles.summaryBox}>
            <View style={styles.summaryTop}>
              <Text style={styles.variantLabel}>
                {lastItem.variantName ? `Portion: ${lastItem.variantName}` : 'Standard'}
              </Text>
              <Text style={styles.priceLabel}>
                {formatPaiseToRupees(lastItem.pricePaise)}
              </Text>
            </View>
            {lastItem.addOnSummary && lastItem.addOnSummary.length > 0 && (
              <Text style={styles.addOnsText}>
                + {lastItem.addOnSummary.join(', ')}
              </Text>
            )}
          </View>

          <View style={styles.buttonRow}>
            <TouchableOpacity style={styles.chooseNewBtn} onPress={onChooseNew}>
              <Text style={styles.chooseNewText}>Choose New</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.repeatBtn} onPress={onRepeatLast}>
              <Text style={styles.repeatText}>Repeat Last</Text>
            </TouchableOpacity>
          </View>

          <TouchableOpacity style={styles.cancelBtn} onPress={onClose}>
            <Text style={styles.cancelText}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  card: {
    width: '100%',
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 20,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 10,
    elevation: 8,
  },
  title: { fontSize: 17, fontWeight: '800', color: '#0F172A', textAlign: 'center' },
  dishName: {
    fontSize: 13,
    color: '#64748B',
    textAlign: 'center',
    marginTop: 4,
    marginBottom: 16,
  },
  summaryBox: {
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 14,
    marginBottom: 18,
  },
  summaryTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  variantLabel: { fontSize: 14, fontWeight: '700', color: '#0F172A' },
  priceLabel: { fontSize: 14, fontWeight: '800', color: '#0D9488' },
  addOnsText: { fontSize: 12, color: '#64748B', marginTop: 4 },
  buttonRow: { flexDirection: 'row', gap: 10 },
  chooseNewBtn: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#0D9488',
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
  },
  chooseNewText: { color: '#0D9488', fontWeight: '800', fontSize: 13 },
  repeatBtn: {
    flex: 1,
    backgroundColor: '#0D9488',
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
  },
  repeatText: { color: '#FFFFFF', fontWeight: '800', fontSize: 13 },
  cancelBtn: { marginTop: 12, alignItems: 'center' },
  cancelText: { color: '#94A3B8', fontSize: 12, fontWeight: '600' },
});
