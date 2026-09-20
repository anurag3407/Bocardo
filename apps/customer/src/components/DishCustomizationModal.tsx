import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  SafeAreaView,
  Alert,
} from 'react-native';
import {
  formatPaiseToRupees,
  DishVariant,
  AddOnGroup,
  AddOnSelection,
  priceCustomization,
  FoodType,
} from '@bocardo/shared-types';
import { FssaiBadge } from './FssaiBadge';
import { CartItemInput } from '../lib/cart';

export interface CustomizableDish {
  id: string;
  name: string;
  pricePaise: number;
  isVeg: boolean;
  foodType?: FoodType;
  description?: string;
  variants?: DishVariant[];
  addOnGroups?: AddOnGroup[];
}

interface Props {
  visible: boolean;
  dish: CustomizableDish | null;
  restaurantId: string;
  restaurantName: string;
  onClose: () => void;
  onAddToCart: (item: CartItemInput) => void;
}

export const DishCustomizationModal: React.FC<Props> = ({
  visible,
  dish,
  restaurantId,
  restaurantName,
  onClose,
  onAddToCart,
}) => {
  const [selectedVariantId, setSelectedVariantId] = useState<string | null>(null);
  const [selectedAddOns, setSelectedAddOns] = useState<AddOnSelection[]>([]);

  // Initialize defaults on dish change
  useEffect(() => {
    if (!dish) return;
    if (dish.variants && dish.variants.length > 0) {
      const defaultVariant = dish.variants.find((v) => v.isDefault) || dish.variants[0];
      setSelectedVariantId(defaultVariant.id);
    } else {
      setSelectedVariantId(null);
    }
    setSelectedAddOns([]);
  }, [dish]);

  // Compute live price & summary
  const pricing = useMemo(() => {
    if (!dish) return { unitPricePaise: 0, addOnSummary: [] };
    try {
      return priceCustomization(
        dish.pricePaise,
        {
          variants: dish.variants,
          addOnGroups: dish.addOnGroups,
        },
        {
          variantId: selectedVariantId,
          addOns: selectedAddOns,
        }
      );
    } catch {
      // Fallback base calculation if incomplete mandatory selection
      let base = dish.pricePaise;
      if (dish.variants && selectedVariantId) {
        const v = dish.variants.find((cand) => cand.id === selectedVariantId);
        if (v) base = v.pricePaise;
      }
      let addOnsTotal = 0;
      const summary: string[] = [];
      for (const sel of selectedAddOns) {
        const grp = dish.addOnGroups?.find((g) => g.id === sel.groupId);
        const opt = grp?.options.find((o) => o.id === sel.optionId);
        if (opt) {
          addOnsTotal += opt.pricePaise * sel.quantity;
          summary.push(sel.quantity > 1 ? `${opt.name} x${sel.quantity}` : opt.name);
        }
      }
      return { unitPricePaise: base + addOnsTotal, addOnSummary: summary };
    }
  }, [dish, selectedVariantId, selectedAddOns]);

  if (!dish) return null;

  const handleToggleAddOn = (group: AddOnGroup, optionId: string) => {
    const existingIndex = selectedAddOns.findIndex(
      (a) => a.groupId === group.id && a.optionId === optionId
    );

    if (group.isMultiSelect) {
      if (existingIndex > -1) {
        // Remove
        setSelectedAddOns((prev) => prev.filter((_, idx) => idx !== existingIndex));
      } else {
        // Check max selections
        const groupCount = selectedAddOns
          .filter((a) => a.groupId === group.id)
          .reduce((sum, a) => sum + a.quantity, 0);

        if (groupCount >= group.maxSelections) {
          Alert.alert('Selection Limit', `You can select up to ${group.maxSelections} options in this group.`);
          return;
        }
        setSelectedAddOns((prev) => [
          ...prev,
          { groupId: group.id, optionId, quantity: 1 },
        ]);
      }
    } else {
      // Single select inside group
      const filtered = selectedAddOns.filter((a) => a.groupId !== group.id);
      if (existingIndex > -1 && group.minSelections === 0) {
        // Deselect optional single-select
        setSelectedAddOns(filtered);
      } else {
        setSelectedAddOns([...filtered, { groupId: group.id, optionId, quantity: 1 }]);
      }
    }
  };

  const handleConfirm = () => {
    if (!dish) return;

    // Validate using shared-types validator
    try {
      const verified = priceCustomization(
        dish.pricePaise,
        {
          variants: dish.variants,
          addOnGroups: dish.addOnGroups,
        },
        {
          variantId: selectedVariantId,
          addOns: selectedAddOns,
        }
      );

      const customName = verified.variantName
        ? `${dish.name} (${verified.variantName})`
        : dish.name;

      onAddToCart({
        dishId: dish.id,
        name: customName,
        pricePaise: verified.unitPricePaise,
        isVeg: dish.isVeg,
        restaurantId,
        restaurantName,
        variantId: verified.variantId,
        variantName: verified.variantName,
        addOnSummary: verified.addOnSummary,
        customization: {
          variantId: selectedVariantId,
          addOns: selectedAddOns,
        },
      });

      onClose();
    } catch (e: any) {
      Alert.alert('Required Selection', e.message || 'Please complete mandatory choices.');
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.sheetContainer}>
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.titleRow}>
              <FssaiBadge foodType={dish.foodType || dish.isVeg} size={16} />
              <Text style={styles.dishTitle}>{dish.name}</Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <Text style={styles.closeBtnText}>✕</Text>
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.scrollBody} contentContainerStyle={styles.scrollContent}>
            {/* Variants (Portion Size) Section */}
            {dish.variants && dish.variants.length > 0 && (
              <View style={styles.section}>
                <View style={styles.sectionHeaderRow}>
                  <Text style={styles.sectionTitle}>Select Portion / Size</Text>
                  <Text style={styles.mandatoryBadge}>REQUIRED</Text>
                </View>
                <Text style={styles.sectionSubtitle}>Select 1 option</Text>

                {dish.variants.map((v) => {
                  const isSelected = selectedVariantId === v.id;
                  return (
                    <TouchableOpacity
                      key={v.id}
                      style={[styles.optionRow, isSelected && styles.optionRowSelected]}
                      onPress={() => setSelectedVariantId(v.id)}
                    >
                      <View style={styles.radioOuter}>
                        {isSelected && <View style={styles.radioInner} />}
                      </View>
                      <Text style={styles.optionName}>{v.name}</Text>
                      <Text style={styles.optionPrice}>{formatPaiseToRupees(v.pricePaise)}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}

            {/* Add-On Groups */}
            {dish.addOnGroups &&
              dish.addOnGroups.map((group) => {
                const isMandatory = group.minSelections > 0;
                return (
                  <View key={group.id} style={styles.section}>
                    <View style={styles.sectionHeaderRow}>
                      <Text style={styles.sectionTitle}>{group.name}</Text>
                      {isMandatory ? (
                        <Text style={styles.mandatoryBadge}>REQUIRED</Text>
                      ) : (
                        <Text style={styles.optionalBadge}>OPTIONAL</Text>
                      )}
                    </View>
                    <Text style={styles.sectionSubtitle}>
                      {group.isMultiSelect
                        ? `Choose up to ${group.maxSelections} option${group.maxSelections > 1 ? 's' : ''}`
                        : 'Choose 1 option'}
                    </Text>

                    {group.options.map((opt) => {
                      const isSelected = selectedAddOns.some(
                        (a) => a.groupId === group.id && a.optionId === opt.id
                      );
                      return (
                        <TouchableOpacity
                          key={opt.id}
                          style={[styles.optionRow, isSelected && styles.optionRowSelected]}
                          onPress={() => handleToggleAddOn(group, opt.id)}
                          disabled={!opt.isAvailable}
                        >
                          <View
                            style={[
                              group.isMultiSelect ? styles.checkboxOuter : styles.radioOuter,
                              isSelected && styles.boxSelected,
                            ]}
                          >
                            {isSelected && (
                              <View
                                style={
                                  group.isMultiSelect
                                    ? styles.checkboxInner
                                    : styles.radioInner
                                }
                              />
                            )}
                          </View>
                          <View style={styles.optLabelCol}>
                            <View style={styles.optNameRow}>
                              {opt.isVeg !== undefined && (
                                <FssaiBadge foodType={opt.isVeg} size={12} />
                              )}
                              <Text
                                style={[
                                  styles.optionName,
                                  !opt.isAvailable && styles.disabledText,
                                ]}
                              >
                                {opt.name}
                              </Text>
                            </View>
                            {!opt.isAvailable && (
                              <Text style={styles.unavailableTag}>SOLD OUT</Text>
                            )}
                          </View>
                          <Text style={styles.optionPrice}>
                            +{formatPaiseToRupees(opt.pricePaise)}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                );
              })}
          </ScrollView>

          {/* Bottom Action Bar */}
          <SafeAreaView style={styles.footerContainer}>
            <View style={styles.footerRow}>
              <View>
                <Text style={styles.footerPriceLabel}>Item Total</Text>
                <Text style={styles.footerPrice}>
                  {formatPaiseToRupees(pricing.unitPricePaise)}
                </Text>
              </View>
              <TouchableOpacity style={styles.confirmBtn} onPress={handleConfirm}>
                <Text style={styles.confirmBtnText}>Add Item to Cart →</Text>
              </TouchableOpacity>
            </View>
          </SafeAreaView>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.65)',
    justifyContent: 'flex-end',
  },
  sheetContainer: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '82%',
    paddingBottom: 8,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1, paddingRight: 10 },
  dishTitle: { fontSize: 17, fontWeight: '800', color: '#0F172A' },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeBtnText: { fontSize: 16, fontWeight: '700', color: '#64748B' },
  scrollBody: { maxHeight: 420 },
  scrollContent: { paddingHorizontal: 18, paddingVertical: 12 },
  section: {
    marginBottom: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#F8FAFC',
    paddingBottom: 14,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  sectionTitle: { fontSize: 15, fontWeight: '800', color: '#0F172A' },
  sectionSubtitle: { fontSize: 12, color: '#64748B', marginTop: 2, marginBottom: 8 },
  mandatoryBadge: {
    fontSize: 10,
    fontWeight: '800',
    color: '#D97706',
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  optionalBadge: {
    fontSize: 10,
    fontWeight: '700',
    color: '#64748B',
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderRadius: 10,
    marginVertical: 2,
  },
  optionRowSelected: {
    backgroundColor: '#F0FDFA',
  },
  radioOuter: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 2,
    borderColor: '#94A3B8',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  radioInner: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#0D9488',
  },
  checkboxOuter: {
    width: 18,
    height: 18,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: '#94A3B8',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  checkboxInner: {
    width: 10,
    height: 10,
    borderRadius: 2,
    backgroundColor: '#0D9488',
  },
  boxSelected: {
    borderColor: '#0D9488',
  },
  optLabelCol: { flex: 1 },
  optNameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  optionName: { fontSize: 14, fontWeight: '600', color: '#1E293B' },
  optionPrice: { fontSize: 13, fontWeight: '700', color: '#0F172A' },
  disabledText: { color: '#94A3B8', textDecorationLine: 'line-through' },
  unavailableTag: { fontSize: 10, fontWeight: '800', color: '#DC2626', marginTop: 1 },
  footerContainer: {
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
    paddingHorizontal: 18,
    paddingTop: 12,
  },
  footerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  footerPriceLabel: { fontSize: 11, color: '#64748B', fontWeight: '600' },
  footerPrice: { fontSize: 18, fontWeight: '900', color: '#0F172A' },
  confirmBtn: {
    backgroundColor: '#0D9488',
    paddingHorizontal: 22,
    paddingVertical: 12,
    borderRadius: 12,
    shadowColor: '#0D9488',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 4,
  },
  confirmBtnText: { color: '#FFFFFF', fontWeight: '800', fontSize: 14 },
});
