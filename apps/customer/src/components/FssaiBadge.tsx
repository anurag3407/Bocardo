import React from 'react';
import { View, StyleSheet } from 'react-native';
import { FoodType } from '@bocardo/shared-types';

export interface FssaiBadgeProps {
  foodType?: FoodType | 'VEG' | 'NON_VEG' | 'EGG' | boolean;
  size?: number;
}

export const FssaiBadge: React.FC<FssaiBadgeProps> = ({ foodType = FoodType.VEG, size = 15 }) => {
  // Normalize boolean or string input
  let type: FoodType = FoodType.VEG;
  if (typeof foodType === 'boolean') {
    type = foodType ? FoodType.VEG : FoodType.NON_VEG;
  } else if (foodType === FoodType.NON_VEG) {
    type = FoodType.NON_VEG;
  } else if (foodType === FoodType.EGG) {
    type = FoodType.EGG;
  } else {
    type = FoodType.VEG;
  }

  const isVeg = type === FoodType.VEG;
  const isEgg = type === FoodType.EGG;
  const isNonVeg = type === FoodType.NON_VEG;

  const borderColor = isVeg ? '#16A34A' : isEgg ? '#D97706' : '#7F1D1D';
  const dotColor = isVeg ? '#16A34A' : '#D97706';
  const triangleColor = '#7F1D1D';

  const dotSize = Math.round(size * 0.44);
  const triWidth = Math.round(size * 0.28);
  const triHeight = Math.round(size * 0.52);

  return (
    <View
      style={[
        styles.outerSquare,
        {
          width: size,
          height: size,
          borderColor,
          borderRadius: Math.max(2, Math.round(size * 0.2)),
        },
      ]}
      accessibilityLabel={isVeg ? 'Vegetarian' : isEgg ? 'Contains Egg' : 'Non-Vegetarian'}
    >
      {isVeg && (
        <View
          style={[
            styles.dot,
            {
              width: dotSize,
              height: dotSize,
              borderRadius: dotSize / 2,
              backgroundColor: dotColor,
            },
          ]}
        />
      )}
      {isEgg && (
        <View
          style={[
            styles.dot,
            {
              width: dotSize,
              height: dotSize * 1.15,
              borderRadius: dotSize / 2,
              backgroundColor: dotColor,
            },
          ]}
        />
      )}
      {isNonVeg && (
        <View
          style={[
            styles.triangle,
            {
              borderLeftWidth: triWidth,
              borderRightWidth: triWidth,
              borderBottomWidth: triHeight,
              borderBottomColor: triangleColor,
            },
          ]}
        />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  outerSquare: {
    borderWidth: 1.5,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dot: {
    alignSelf: 'center',
  },
  triangle: {
    width: 0,
    height: 0,
    backgroundColor: 'transparent',
    borderStyle: 'solid',
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
  },
});
