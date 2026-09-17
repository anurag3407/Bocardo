import React from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

export default function RootLayout() {
  return (
    <>
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
    </>
  );
}
