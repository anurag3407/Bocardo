import React, { useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';

SplashScreen.preventAutoHideAsync().catch(() => {});

export default function RootLayout() {
  useEffect(() => {
    SplashScreen.hideAsync().catch(() => {});
  }, []);

  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: '#FFFFFF' },
          headerTintColor: '#0F172A',
          headerTitleStyle: { fontWeight: '700' },
          contentStyle: { backgroundColor: '#F8FAFC' },
        }}
      >
        <Stack.Screen
          name="index"
          options={{
            headerShown: false,
          }}
        />
        <Stack.Screen
          name="restaurant/[id]"
          options={{
            title: 'Menu',
            headerBackTitle: 'Back',
          }}
        />
        <Stack.Screen
          name="cart"
          options={{
            title: 'Checkout & Bill',
            presentation: 'modal',
          }}
        />
        <Stack.Screen
          name="orders/[id]"
          options={{
            title: 'Live Order Tracking',
            headerBackVisible: false,
          }}
        />
      </Stack>
    </SafeAreaProvider>
  );
}

export function ErrorBoundary({ error, retry }: { error: Error; retry: () => void }) {
  useEffect(() => {
    SplashScreen.hideAsync().catch(() => {});
  }, []);

  return (
    <SafeAreaProvider>
      <SafeAreaView style={styles.errorContainer}>
        <StatusBar style="dark" />
        <Text style={styles.errorIcon}>⚠️</Text>
        <Text style={styles.errorTitle}>Something went wrong</Text>
        <Text style={styles.errorMessage}>{error?.message || 'Unable to start application.'}</Text>
        <TouchableOpacity style={styles.retryButton} onPress={retry}>
          <Text style={styles.retryButtonText}>Reload</Text>
        </TouchableOpacity>
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  errorContainer: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  errorIcon: { fontSize: 40, marginBottom: 12 },
  errorTitle: { fontSize: 20, fontWeight: '800', color: '#0F172A', marginBottom: 8 },
  errorMessage: { fontSize: 13, color: '#64748B', textAlign: 'center', marginBottom: 24 },
  retryButton: {
    backgroundColor: '#0D9488',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 12,
  },
  retryButtonText: { color: '#FFFFFF', fontWeight: '800', fontSize: 14 },
});
