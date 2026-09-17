import React, { useState } from 'react';
import { View, Text, ScrollView, Switch, StyleSheet, SafeAreaView, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { formatPaiseToRupees } from '@bocardo/shared-types';

interface MenuItem {
  id: string;
  name: string;
  category: string;
  pricePaise: number;
  isAvailable: boolean;
  isVeg: boolean;
}

const INITIAL_MENU: MenuItem[] = [
  { id: 'dish-1', name: 'Hyderabadi Dum Biryani', category: 'Biryani', pricePaise: 32000, isAvailable: true, isVeg: false },
  { id: 'dish-2', name: 'Paneer Tikka Biryani', category: 'Biryani', pricePaise: 28000, isAvailable: true, isVeg: true },
  { id: 'dish-3', name: 'Burani Garlic Raita & Salan', category: 'Accompaniments', pricePaise: 6000, isAvailable: true, isVeg: true },
  { id: 'dish-4', name: 'Gulab Jamun (2 Pcs)', category: 'Desserts', pricePaise: 8000, isAvailable: false, isVeg: true },
];

export default function MenuManagementScreen() {
  const router = useRouter();
  const [items, setItems] = useState<MenuItem[]>(INITIAL_MENU);

  const toggleAvailability = (id: string) => {
    setItems((prev) =>
      prev.map((item) =>
        item.id === id ? { ...item, isAvailable: !item.isAvailable } : item
      )
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Text style={styles.backBtnText}>← Back to KOT</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Menu Item 86-ing (Instant Stock Toggle)</Text>
      </View>

      <ScrollView contentContainerStyle={styles.list}>
        {items.map((item) => (
          <View
            key={item.id}
            style={[styles.itemCard, !item.isAvailable && styles.itemCardOut]}
          >
            <View style={styles.itemInfo}>
              <Text style={styles.itemName}>{item.name}</Text>
              <Text style={styles.itemMeta}>
                {item.category} • {formatPaiseToRupees(item.pricePaise)} •{' '}
                {item.isVeg ? 'Veg 🟢' : 'Non-Veg 🔴'}
              </Text>
              <Text
                style={[
                  styles.statusTag,
                  item.isAvailable ? styles.statusInStock : styles.status86,
                ]}
              >
                {item.isAvailable ? 'IN STOCK (ACCEPTING ORDERS)' : '86-ED (SOLD OUT)'}
              </Text>
            </View>
            <Switch
              value={item.isAvailable}
              onValueChange={() => toggleAvailability(item.id)}
              trackColor={{ false: '#7F1D1D', true: '#15803D' }}
              thumbColor={item.isAvailable ? '#22C55E' : '#EF4444'}
            />
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0F172A' },
  header: {
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#334155',
  },
  backBtn: {
    backgroundColor: '#1E293B',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
  },
  backBtnText: { color: '#38BDF8', fontWeight: '800', fontSize: 13 },
  title: { fontSize: 16, fontWeight: '800', color: '#FFFFFF' },
  list: { padding: 16 },
  itemCard: {
    backgroundColor: '#1E293B',
    borderRadius: 12,
    padding: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#334155',
  },
  itemCardOut: { borderColor: '#DC2626' },
  itemInfo: { flex: 1 },
  itemName: { fontSize: 16, fontWeight: '800', color: '#FFFFFF' },
  itemMeta: { fontSize: 13, color: '#94A3B8', marginTop: 4 },
  statusTag: { fontSize: 11, fontWeight: '900', marginTop: 6 },
  statusInStock: { color: '#4ADE80' },
  status86: { color: '#F87171' },
});
