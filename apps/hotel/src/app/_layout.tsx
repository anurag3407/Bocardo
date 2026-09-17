import React, { useState, useEffect } from 'react';
import { Stack, useRouter } from 'expo-router';
import { View, Text, TouchableOpacity, Switch, StyleSheet, SafeAreaView } from 'react-native';
import { thermalPrinterService } from '../services/printer';
import { kitchenAlarmService } from '../services/alarm';

export default function HotelLayout() {
  const router = useRouter();
  const [isAccepting, setIsAccepting] = useState(true);
  const [printerStatus, setPrinterStatus] = useState(thermalPrinterService.getStatus());
  const [queueCount, setQueueCount] = useState(0);
  const [isAlarmPlaying, setIsAlarmPlaying] = useState(false);

  useEffect(() => {
    const unsubPrinter = thermalPrinterService.subscribe((status, count) => {
      setPrinterStatus(status);
      setQueueCount(count);
    });
    const unsubAlarm = kitchenAlarmService.subscribe((playing) => {
      setIsAlarmPlaying(playing);
    });
    return () => {
      unsubPrinter();
      unsubAlarm();
    };
  }, []);

  return (
    <SafeAreaView style={styles.safeArea}>
      {/* Top Tablet/Mobile Operational Navigation Bar */}
      <View style={styles.topBar}>
        <View style={styles.brandCol}>
          <Text style={styles.brandTitle}>Biryani Bliss & Kebabs</Text>
          <Text style={styles.brandSubtitle}>KOT Station • Tablet Terminal #1</Text>
        </View>

        <View style={styles.actionsRow}>
          {/* Persistent Disconnect Warning Banner or Connected Badge */}
          <TouchableOpacity
            style={[
              styles.printerBadge,
              printerStatus === 'CONNECTED' ? styles.printerOk : styles.printerWarn,
            ]}
            onPress={() => thermalPrinterService.togglePrinterStatus()}
          >
            <Text style={styles.printerText}>
              {printerStatus === 'CONNECTED'
                ? '🖨️ Thermal Printer Online (58mm)'
                : `⚠️ Printer Offline (${queueCount} Queued) - Tap to Fix`}
            </Text>
          </TouchableOpacity>

          {/* Nav Buttons */}
          <TouchableOpacity style={styles.navBtn} onPress={() => router.push('/')}>
            <Text style={styles.navBtnText}>📋 KOT Board</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.navBtn} onPress={() => router.push('/menu')}>
            <Text style={styles.navBtnText}>🍴 Menu 86-ing</Text>
          </TouchableOpacity>

          {/* Kitchen Online Switch */}
          <View style={styles.switchContainer}>
            <Text style={styles.switchLabel}>{isAccepting ? 'ONLINE' : 'OFFLINE'}</Text>
            <Switch
              value={isAccepting}
              onValueChange={setIsAccepting}
              trackColor={{ false: '#64748B', true: '#22C55E' }}
              thumbColor="#FFFFFF"
            />
          </View>
        </View>
      </View>

      {/* Persistent Alarm Banner if currently looping */}
      {isAlarmPlaying && (
        <View style={styles.alarmAlertBar}>
          <Text style={styles.alarmAlertText}>
            🚨 NEW ORDER INCOMING! HIGH-VOLUME ALARM ACTIVE — TAP 'ACCEPT' TO SILENCE!
          </Text>
        </View>
      )}

      <Stack screenOptions={{ headerShown: false }} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#0F172A' },
  topBar: {
    backgroundColor: '#1E293B',
    paddingHorizontal: 20,
    paddingVertical: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#334155',
  },
  brandCol: { justifyContent: 'center' },
  brandTitle: { fontSize: 18, fontWeight: '900', color: '#FFFFFF' },
  brandSubtitle: { fontSize: 12, color: '#94A3B8', marginTop: 2 },
  actionsRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  printerBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
  },
  printerOk: { backgroundColor: '#064E3B', borderColor: '#059669' },
  printerWarn: { backgroundColor: '#7F1D1D', borderColor: '#DC2626' },
  printerText: { fontSize: 12, fontWeight: '700', color: '#FFFFFF' },
  navBtn: {
    backgroundColor: '#334155',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
  },
  navBtnText: { color: '#F1F5F9', fontWeight: '700', fontSize: 13 },
  switchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#0F172A',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 8,
  },
  switchLabel: { fontSize: 12, fontWeight: '900', color: '#FFFFFF' },
  alarmAlertBar: {
    backgroundColor: '#DC2626',
    paddingVertical: 8,
    alignItems: 'center',
  },
  alarmAlertText: { color: '#FFFFFF', fontWeight: '900', fontSize: 13, letterSpacing: 0.5 },
});
