import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Image,
  StyleSheet,
  SafeAreaView,
  TextInput,
  Modal,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { formatPaiseToRupees, FoodType } from '@bocardo/shared-types';
import { cartStore, CartItemInput } from '../../lib/cart';
import { FssaiBadge } from '../../components/FssaiBadge';
import { DishCustomizationModal, CustomizableDish } from '../../components/DishCustomizationModal';
import { RepeatCustomizationModal } from '../../components/RepeatCustomizationModal';

const DEMO_MENU = {
  id: 'rest-1-uuid',
  name: 'Biryani Bliss & Kebabs',
  rating: 4.6,
  ratingCount: '1.2K+ ratings',
  deliveryTime: '25-30 mins',
  distance: '1.2 km',
  address: '100 Feet Rd, HAL 2nd Stage, Indiranagar',
  cuisines: ['Biryani', 'Mughlai', 'Kebabs', 'Desserts'],
  dishes: [
    {
      id: 'dish-1-uuid',
      name: 'Hyderabadi Chicken Dum Biryani',
      pricePaise: 32000,
      isVeg: false,
      foodType: FoodType.NON_VEG,
      category: 'Bestseller Biryani',
      isBestseller: true,
      description: 'Slow-cooked aromatic basmati rice with tender marinated chicken, secret spices & pure saffron.',
      imageUrl: 'https://images.unsplash.com/photo-1563379091339-03b21ab4a4f8?w=500',
      variants: [
        { id: 'v-half', name: 'Half (Serves 1)', pricePaise: 24000, isDefault: false },
        { id: 'v-full', name: 'Full (Serves 2)', pricePaise: 36000, isDefault: true },
      ],
      addOnGroups: [
        {
          id: 'g-accomp',
          name: 'Recommended Accompaniments',
          minSelections: 0,
          maxSelections: 2,
          isMultiSelect: true,
          options: [
            { id: 'opt-raita', name: 'Burani Garlic Raita', pricePaise: 5000, isAvailable: true, isVeg: true },
            { id: 'opt-salan', name: 'Mirchi Ka Salan', pricePaise: 4000, isAvailable: true, isVeg: true },
            { id: 'opt-egg', name: 'Extra Boiled Egg (1 pc)', pricePaise: 2500, isAvailable: true, isVeg: false },
          ],
        },
      ],
    },
    {
      id: 'dish-2-uuid',
      name: 'Royal Paneer Tikka Biryani',
      pricePaise: 28000,
      isVeg: true,
      foodType: FoodType.VEG,
      category: 'Bestseller Biryani',
      isBestseller: true,
      description: 'Charcoal-grilled malai cottage cheese cubes layered with basmati rice, mint & caramelized onions.',
      imageUrl: 'https://images.unsplash.com/photo-1645177628172-a94c1f96e6db?w=500',
      variants: [
        { id: 'v-p-half', name: 'Half (Serves 1)', pricePaise: 22000, isDefault: false },
        { id: 'v-p-full', name: 'Full (Serves 2)', pricePaise: 32000, isDefault: true },
      ],
    },
    {
      id: 'dish-3-uuid',
      name: 'Galouti Mutton Kebabs (4 Pcs)',
      pricePaise: 39000,
      isVeg: false,
      foodType: FoodType.NON_VEG,
      category: 'Starters & Kebabs',
      isBestseller: true,
      description: 'Melt-in-mouth smoked lamb patties infused with raw papaya and 16 aromatic Awadhi spices.',
      imageUrl: 'https://images.unsplash.com/photo-1599488615731-7e5c2823ff28?w=500',
    },
    {
      id: 'dish-4-uuid',
      name: 'Dahi Ke Kebab (4 Pcs)',
      pricePaise: 24000,
      isVeg: true,
      foodType: FoodType.VEG,
      category: 'Starters & Kebabs',
      isBestseller: false,
      description: 'Crispy spiced hung curd patties seasoned with roasted cumin, green chillies & fresh coriander.',
      imageUrl: 'https://images.unsplash.com/photo-1541832676-9b763b0239ab?w=500',
    },
    {
      id: 'dish-5-uuid',
      name: 'Burani Garlic Raita & Salan Combo',
      pricePaise: 6000,
      isVeg: true,
      foodType: FoodType.VEG,
      category: 'Accompaniments',
      isBestseller: false,
      description: 'Slow-roasted garlic-infused thick creamy curd raita with classic spicy peanut-sesame salan.',
      imageUrl: 'https://images.unsplash.com/photo-1546833999-b9f581a1996d?w=500',
    },
    {
      id: 'dish-6-uuid',
      name: 'Butter Naan & Rumali Roti (2 Pcs)',
      pricePaise: 7000,
      isVeg: true,
      foodType: FoodType.VEG,
      category: 'Accompaniments',
      isBestseller: false,
      description: 'Traditional tandoor-baked layered leavened bread brushed generously with salted white butter.',
      imageUrl: 'https://images.unsplash.com/photo-1533777857889-4be7c70b33f7?w=500',
    },
    {
      id: 'dish-7-uuid',
      name: 'Shahi Gulab Jamun (2 Pcs)',
      pricePaise: 8000,
      isVeg: true,
      foodType: FoodType.VEG,
      category: 'Desserts',
      isBestseller: true,
      description: 'Traditional melt-in-mouth khoya dumplings soaked in saffron and green cardamom sugar syrup.',
      imageUrl: 'https://images.unsplash.com/photo-1601050690597-df0568f70950?w=500',
    },
    {
      id: 'dish-8-uuid',
      name: 'Classic Kesar Phirni',
      pricePaise: 9000,
      isVeg: true,
      foodType: FoodType.VEG,
      category: 'Desserts',
      isBestseller: false,
      description: 'Slow-simmered Kashmiri saffron ground rice pudding served chilled in traditional earthen shikora.',
      imageUrl: 'https://images.unsplash.com/photo-1571091718767-18b5b1457add?w=500',
    },
  ],
};

type DietaryFilter = 'ALL' | 'VEG_ONLY' | 'NON_VEG_ONLY';

export default function RestaurantMenuScreen() {
  const { id } = useLocalSearchParams();
  const router = useRouter();

  // State
  const [dietaryFilter, setDietaryFilter] = useState<DietaryFilter>('ALL');
  const [bestsellerOnly, setBestsellerOnly] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState('All');
  const [isBrowseMenuVisible, setIsBrowseMenuVisible] = useState(false);

  // Customization modal state
  const [activeCustomizableDish, setActiveCustomizableDish] = useState<CustomizableDish | null>(null);
  const [repeatModalDish, setRepeatModalDish] = useState<CustomizableDish | null>(null);

  const [, setTick] = useState(0);
  const scrollViewRef = useRef<ScrollView>(null);

  useEffect(() => {
    return cartStore.subscribe(() => setTick((t) => t + 1));
  }, []);

  // Distinct categories
  const categories = ['All', ...Array.from(new Set(DEMO_MENU.dishes.map((d) => d.category)))];

  // Filter dishes
  const filteredDishes = DEMO_MENU.dishes.filter((dish) => {
    // Dietary filter
    if (dietaryFilter === 'VEG_ONLY' && !dish.isVeg) return false;
    if (dietaryFilter === 'NON_VEG_ONLY' && dish.isVeg) return false;

    // Bestseller filter
    if (bestsellerOnly && !dish.isBestseller) return false;

    // Category filter
    if (activeCategory !== 'All' && dish.category !== activeCategory) return false;

    // Search query
    if (searchQuery.trim().length > 0) {
      const q = searchQuery.toLowerCase();
      const matchName = dish.name.toLowerCase().includes(q);
      const matchDesc = dish.description.toLowerCase().includes(q);
      if (!matchName && !matchDesc) return false;
    }

    return true;
  });

  // Group dishes by category for display
  const groupedCategories = Array.from(
    new Set(filteredDishes.map((d) => d.category))
  );

  const totalCartCount = cartStore.getItems().reduce((acc, i) => acc + i.quantity, 0);
  const subtotalPaise = cartStore.getSubtotalPaise();

  // Handle ADD button tap
  const handleAddTap = (dish: (typeof DEMO_MENU.dishes)[0]) => {
    const isCustomizable =
      (dish.variants && dish.variants.length > 0) ||
      (dish.addOnGroups && dish.addOnGroups.length > 0);

    if (isCustomizable) {
      setActiveCustomizableDish(dish as CustomizableDish);
    } else {
      cartStore.addItem({
        dishId: dish.id,
        name: dish.name,
        pricePaise: dish.pricePaise,
        isVeg: dish.isVeg,
        restaurantId: DEMO_MENU.id,
        restaurantName: DEMO_MENU.name,
      });
    }
  };

  // Handle stepper plus tap
  const handlePlusTap = (dish: (typeof DEMO_MENU.dishes)[0]) => {
    const isCustomizable =
      (dish.variants && dish.variants.length > 0) ||
      (dish.addOnGroups && dish.addOnGroups.length > 0);

    if (isCustomizable) {
      // Prompt repeat last or choose new
      setRepeatModalDish(dish as CustomizableDish);
    } else {
      cartStore.addItem({
        dishId: dish.id,
        name: dish.name,
        pricePaise: dish.pricePaise,
        isVeg: dish.isVeg,
        restaurantId: DEMO_MENU.id,
        restaurantName: DEMO_MENU.name,
      });
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Top Navbar */}
      <View style={styles.navbar}>
        <TouchableOpacity style={styles.navBackBtn} onPress={() => router.back()}>
          <Text style={styles.navBackIcon}>←</Text>
        </TouchableOpacity>
        <View style={styles.navTitleCol}>
          <Text style={styles.navTitle} numberOfLines={1}>{DEMO_MENU.name}</Text>
          <Text style={styles.navSub}>{DEMO_MENU.deliveryTime} • {DEMO_MENU.distance}</Text>
        </View>
        <TouchableOpacity style={styles.navActionBtn} onPress={() => router.push('/cart')}>
          <Text style={styles.navActionIcon}>🛒</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        ref={scrollViewRef}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {/* Restaurant Hero Card */}
        <View style={styles.restaurantCard}>
          <View style={styles.cardHeader}>
            <View style={styles.restMainCol}>
              <Text style={styles.restaurantTitle}>{DEMO_MENU.name}</Text>
              <Text style={styles.cuisinesText}>{DEMO_MENU.cuisines.join(', ')}</Text>
              <Text style={styles.addressText}>{DEMO_MENU.address}</Text>
            </View>
            <View style={styles.ratingBox}>
              <Text style={styles.ratingNumber}>★ {DEMO_MENU.rating}</Text>
              <Text style={styles.ratingCount}>{DEMO_MENU.ratingCount}</Text>
            </View>
          </View>

          <View style={styles.divider} />

          <View style={styles.deliveryBadgeRow}>
            <Text style={styles.slaBadge}>⚡ {DEMO_MENU.deliveryTime}</Text>
            <Text style={styles.dotSeparator}>•</Text>
            <Text style={styles.slaDistance}>{DEMO_MENU.distance} away</Text>
            <Text style={styles.dotSeparator}>•</Text>
            <Text style={styles.freeDeliveryBadge}>₹40 Delivery Fee</Text>
          </View>
        </View>

        {/* In-Menu Search Input */}
        <View style={styles.searchBarContainer}>
          <Text style={styles.searchIcon}>🔍</Text>
          <TextInput
            placeholder={`Search in ${DEMO_MENU.name}...`}
            placeholderTextColor="#94A3B8"
            style={styles.searchInput}
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery('')}>
              <Text style={styles.clearSearch}>✕</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Swiggy-Style Dietary & Quick Filter Bar */}
        <View style={styles.filterPillRow}>
          {/* Veg Only Pill */}
          <TouchableOpacity
            style={[
              styles.filterPill,
              dietaryFilter === 'VEG_ONLY' && styles.vegPillActive,
            ]}
            onPress={() =>
              setDietaryFilter(dietaryFilter === 'VEG_ONLY' ? 'ALL' : 'VEG_ONLY')
            }
          >
            <FssaiBadge foodType={FoodType.VEG} size={14} />
            <Text
              style={[
                styles.filterPillText,
                dietaryFilter === 'VEG_ONLY' && styles.vegPillTextActive,
              ]}
            >
              Veg
            </Text>
          </TouchableOpacity>

          {/* Non-Veg Only Pill */}
          <TouchableOpacity
            style={[
              styles.filterPill,
              dietaryFilter === 'NON_VEG_ONLY' && styles.nonVegPillActive,
            ]}
            onPress={() =>
              setDietaryFilter(
                dietaryFilter === 'NON_VEG_ONLY' ? 'ALL' : 'NON_VEG_ONLY'
              )
            }
          >
            <FssaiBadge foodType={FoodType.NON_VEG} size={14} />
            <Text
              style={[
                styles.filterPillText,
                dietaryFilter === 'NON_VEG_ONLY' && styles.nonVegPillTextActive,
              ]}
            >
              Non-Veg
            </Text>
          </TouchableOpacity>

          {/* Bestseller Pill */}
          <TouchableOpacity
            style={[styles.filterPill, bestsellerOnly && styles.bestsellerPillActive]}
            onPress={() => setBestsellerOnly(!bestsellerOnly)}
          >
            <Text style={styles.bestsellerIcon}>⭐</Text>
            <Text
              style={[
                styles.filterPillText,
                bestsellerOnly && styles.bestsellerPillTextActive,
              ]}
            >
              Bestseller
            </Text>
          </TouchableOpacity>
        </View>

        {/* Sticky Category Anchor Navigation Tabs */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.categoryScroll}
          contentContainerStyle={styles.categoryScrollContent}
        >
          {categories.map((cat) => {
            const isSelected = activeCategory === cat;
            return (
              <TouchableOpacity
                key={cat}
                style={[styles.categoryTab, isSelected && styles.categoryTabActive]}
                onPress={() => setActiveCategory(cat)}
              >
                <Text
                  style={[
                    styles.categoryTabText,
                    isSelected && styles.categoryTabTextActive,
                  ]}
                >
                  {cat}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {/* Menu Dishes Grouped by Category */}
        {filteredDishes.length === 0 ? (
          <View style={styles.emptyResults}>
            <Text style={styles.emptyIcon}>🍽️</Text>
            <Text style={styles.emptyTitle}>No dishes found</Text>
            <Text style={styles.emptySub}>Try clearing filters or search term</Text>
            <TouchableOpacity
              style={styles.resetFiltersBtn}
              onPress={() => {
                setDietaryFilter('ALL');
                setBestsellerOnly(false);
                setSearchQuery('');
                setActiveCategory('All');
              }}
            >
              <Text style={styles.resetFiltersText}>Reset Filters</Text>
            </TouchableOpacity>
          </View>
        ) : (
          groupedCategories.map((category) => {
            const categoryDishes = filteredDishes.filter((d) => d.category === category);
            return (
              <View key={category} style={styles.categorySection}>
                <View style={styles.categoryHeader}>
                  <Text style={styles.categorySectionTitle}>
                    {category} ({categoryDishes.length})
                  </Text>
                </View>

                {categoryDishes.map((dish) => {
                  const qty = cartStore.getDishTotalQuantity(dish.id);
                  const isCustomizable =
                    (dish.variants && dish.variants.length > 0) ||
                    (dish.addOnGroups && dish.addOnGroups.length > 0);

                  return (
                    <View key={dish.id} style={styles.dishCard}>
                      {/* Left: Dish Information */}
                      <View style={styles.dishLeftCol}>
                        <View style={styles.badgeRow}>
                          <FssaiBadge foodType={dish.foodType || dish.isVeg} size={15} />
                          {dish.isBestseller && (
                            <View style={styles.bestsellerTag}>
                              <Text style={styles.bestsellerTagText}>★ BESTSELLER</Text>
                            </View>
                          )}
                        </View>

                        <Text style={styles.dishName}>{dish.name}</Text>
                        <Text style={styles.dishPrice}>{formatPaiseToRupees(dish.pricePaise)}</Text>
                        <Text style={styles.dishDescription} numberOfLines={3}>
                          {dish.description}
                        </Text>
                      </View>

                      {/* Right: Dish Image + Swiggy Stepper Button */}
                      <View style={styles.dishRightCol}>
                        <Image source={{ uri: dish.imageUrl }} style={styles.dishImage} />
                        {qty === 0 ? (
                          <View style={styles.actionBtnWrapper}>
                            <TouchableOpacity
                              style={styles.swiggyAddButton}
                              onPress={() => handleAddTap(dish)}
                            >
                              <Text style={styles.swiggyAddText}>ADD</Text>
                              <Text style={styles.plusSign}>+</Text>
                            </TouchableOpacity>
                            {isCustomizable && (
                              <Text style={styles.customizableNotice}>customisable</Text>
                            )}
                          </View>
                        ) : (
                          <View style={styles.actionBtnWrapper}>
                            <View style={styles.swiggyStepper}>
                              <TouchableOpacity
                                style={styles.stepperSubBtn}
                                onPress={() => cartStore.removeItem(dish.id)}
                              >
                                <Text style={styles.stepperSubText}>−</Text>
                              </TouchableOpacity>
                              <Text style={styles.stepperNum}>{qty}</Text>
                              <TouchableOpacity
                                style={styles.stepperSubBtn}
                                onPress={() => handlePlusTap(dish)}
                              >
                                <Text style={styles.stepperSubText}>+</Text>
                              </TouchableOpacity>
                            </View>
                            {isCustomizable && (
                              <Text style={styles.customizableNotice}>customisable</Text>
                            )}
                          </View>
                        )}
                      </View>
                    </View>
                  );
                })}
              </View>
            );
          })
        )}
      </ScrollView>

      {/* Floating "Browse Menu" FAB Button */}
      <TouchableOpacity
        style={styles.browseMenuFab}
        onPress={() => setIsBrowseMenuVisible(true)}
      >
        <Text style={styles.browseMenuIcon}>📖</Text>
        <Text style={styles.browseMenuText}>MENU</Text>
      </TouchableOpacity>

      {/* Browse Menu Categories Bottom Modal */}
      <Modal
        visible={isBrowseMenuVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setIsBrowseMenuVisible(false)}
      >
        <TouchableOpacity
          style={styles.browseMenuBackdrop}
          activeOpacity={1}
          onPress={() => setIsBrowseMenuVisible(false)}
        >
          <View style={styles.browseMenuCard}>
            <Text style={styles.browseMenuTitle}>Menu Categories</Text>
            {categories.map((cat) => {
              const count =
                cat === 'All'
                  ? DEMO_MENU.dishes.length
                  : DEMO_MENU.dishes.filter((d) => d.category === cat).length;
              return (
                <TouchableOpacity
                  key={cat}
                  style={[
                    styles.browseCatRow,
                    activeCategory === cat && styles.browseCatRowActive,
                  ]}
                  onPress={() => {
                    setActiveCategory(cat);
                    setIsBrowseMenuVisible(false);
                  }}
                >
                  <Text
                    style={[
                      styles.browseCatName,
                      activeCategory === cat && styles.browseCatNameActive,
                    ]}
                  >
                    {cat}
                  </Text>
                  <Text style={styles.browseCatCount}>{count}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Customization Modal */}
      <DishCustomizationModal
        visible={activeCustomizableDish !== null}
        dish={activeCustomizableDish}
        restaurantId={DEMO_MENU.id}
        restaurantName={DEMO_MENU.name}
        onClose={() => setActiveCustomizableDish(null)}
        onAddToCart={(configuredItem: CartItemInput) => {
          cartStore.addItem(configuredItem);
          setActiveCustomizableDish(null);
        }}
      />

      {/* Repeat Customization Modal */}
      {repeatModalDish && (
        <RepeatCustomizationModal
          visible={repeatModalDish !== null}
          dishName={repeatModalDish.name}
          lastItem={cartStore.getLastCustomization(repeatModalDish.id)}
          onClose={() => setRepeatModalDish(null)}
          onRepeatLast={() => {
            const last = cartStore.getLastCustomization(repeatModalDish.id);
            if (last) {
              cartStore.addItem({
                ...last,
                quantity: 1,
              });
            }
            setRepeatModalDish(null);
          }}
          onChooseNew={() => {
            const dishToCustomize = repeatModalDish;
            setRepeatModalDish(null);
            setActiveCustomizableDish(dishToCustomize);
          }}
        />
      )}

      {/* High-Contrast Floating Bottom Cart Bar */}
      {totalCartCount > 0 && (
        <View style={styles.floatingCartContainer}>
          <TouchableOpacity
            style={styles.floatingCartButton}
            onPress={() => router.push('/cart')}
          >
            <View>
              <Text style={styles.cartCountText}>
                {totalCartCount} {totalCartCount === 1 ? 'item' : 'items'} added
              </Text>
              <Text style={styles.cartSubtotalText}>
                {formatPaiseToRupees(subtotalPaise)} plus taxes
              </Text>
            </View>
            <View style={styles.viewCartRow}>
              <Text style={styles.viewCartText}>View Cart</Text>
              <Text style={styles.viewCartArrow}>→</Text>
            </View>
          </TouchableOpacity>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFFFFF' },
  navbar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  navBackBtn: { padding: 6, marginRight: 8 },
  navBackIcon: { fontSize: 20, fontWeight: '700', color: '#0F172A' },
  navTitleCol: { flex: 1 },
  navTitle: { fontSize: 16, fontWeight: '800', color: '#0F172A' },
  navSub: { fontSize: 12, color: '#64748B', marginTop: 1 },
  navActionBtn: { padding: 8 },
  navActionIcon: { fontSize: 18 },
  scrollContent: { paddingBottom: 130 },
  restaurantCard: {
    margin: 16,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 16,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
  },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between' },
  restMainCol: { flex: 1, paddingRight: 10 },
  restaurantTitle: { fontSize: 20, fontWeight: '900', color: '#0F172A' },
  cuisinesText: { fontSize: 13, color: '#64748B', marginTop: 3 },
  addressText: { fontSize: 12, color: '#94A3B8', marginTop: 2 },
  ratingBox: {
    backgroundColor: '#15803D',
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 6,
    alignItems: 'center',
    alignSelf: 'flex-start',
  },
  ratingNumber: { color: '#FFFFFF', fontWeight: '900', fontSize: 13 },
  ratingCount: { color: '#DCFCE7', fontSize: 9, fontWeight: '600', marginTop: 2 },
  divider: { height: 1, backgroundColor: '#F1F5F9', marginVertical: 12 },
  deliveryBadgeRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  slaBadge: { fontSize: 13, fontWeight: '800', color: '#0F172A' },
  dotSeparator: { color: '#94A3B8', fontSize: 12 },
  slaDistance: { fontSize: 12, color: '#64748B', fontWeight: '600' },
  freeDeliveryBadge: { fontSize: 12, color: '#0D9488', fontWeight: '700' },
  searchBarContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginBottom: 12,
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  searchIcon: { fontSize: 15, marginRight: 8 },
  searchInput: { flex: 1, fontSize: 13, color: '#0F172A' },
  clearSearch: { fontSize: 14, color: '#94A3B8', paddingHorizontal: 4 },
  filterPillRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    gap: 8,
    marginBottom: 12,
  },
  filterPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    backgroundColor: '#FFFFFF',
    gap: 6,
  },
  filterPillText: { fontSize: 12, fontWeight: '700', color: '#475569' },
  vegPillActive: { borderColor: '#16A34A', backgroundColor: '#F0FDF4' },
  vegPillTextActive: { color: '#15803D' },
  nonVegPillActive: { borderColor: '#7F1D1D', backgroundColor: '#FEF2F2' },
  nonVegPillTextActive: { color: '#991B1B' },
  bestsellerIcon: { fontSize: 12 },
  bestsellerPillActive: { borderColor: '#F59E0B', backgroundColor: '#FFFBEB' },
  bestsellerPillTextActive: { color: '#B45309' },
  categoryScroll: { borderBottomWidth: 1, borderBottomColor: '#F1F5F9' },
  categoryScrollContent: { paddingHorizontal: 16 },
  categoryTab: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    marginRight: 6,
    borderBottomWidth: 2.5,
    borderBottomColor: 'transparent',
  },
  categoryTabActive: { borderBottomColor: '#0D9488' },
  categoryTabText: { fontSize: 13, fontWeight: '700', color: '#64748B' },
  categoryTabTextActive: { color: '#0D9488', fontWeight: '800' },
  emptyResults: { alignItems: 'center', justifyContent: 'center', padding: 40 },
  emptyIcon: { fontSize: 48, marginBottom: 8 },
  emptyTitle: { fontSize: 16, fontWeight: '800', color: '#0F172A' },
  emptySub: { fontSize: 13, color: '#64748B', marginTop: 2 },
  resetFiltersBtn: {
    marginTop: 14,
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  resetFiltersText: { color: '#0D9488', fontWeight: '700', fontSize: 13 },
  categorySection: { marginTop: 14 },
  categoryHeader: { paddingHorizontal: 16, paddingVertical: 8, backgroundColor: '#F8FAFC' },
  categorySectionTitle: { fontSize: 14, fontWeight: '900', color: '#0F172A', letterSpacing: 0.2 },
  dishCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 18,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  dishLeftCol: { flex: 1, paddingRight: 14 },
  badgeRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 },
  bestsellerTag: {
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 4,
  },
  bestsellerTagText: { fontSize: 9, fontWeight: '800', color: '#B45309' },
  dishName: { fontSize: 16, fontWeight: '800', color: '#0F172A' },
  dishPrice: { fontSize: 14, fontWeight: '800', color: '#1E293B', marginTop: 4 },
  dishDescription: { fontSize: 12, color: '#64748B', marginTop: 6, lineHeight: 18 },
  dishRightCol: { width: 110, alignItems: 'center' },
  dishImage: { width: 104, height: 96, borderRadius: 14 },
  actionBtnWrapper: { position: 'absolute', bottom: -10, alignItems: 'center' },
  swiggyAddButton: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#0D9488',
    paddingHorizontal: 20,
    paddingVertical: 6,
    borderRadius: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  swiggyAddText: { color: '#0D9488', fontWeight: '900', fontSize: 13 },
  plusSign: { color: '#0D9488', fontWeight: '900', fontSize: 13 },
  customizableNotice: { fontSize: 9, color: '#64748B', fontWeight: '700', marginTop: 2 },
  swiggyStepper: {
    backgroundColor: '#0D9488',
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 6,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 3,
  },
  stepperSubBtn: { paddingHorizontal: 6 },
  stepperSubText: { color: '#FFFFFF', fontSize: 16, fontWeight: '900' },
  stepperNum: { color: '#FFFFFF', fontWeight: '900', fontSize: 14, marginHorizontal: 8 },
  browseMenuFab: {
    position: 'absolute',
    bottom: 86,
    alignSelf: 'center',
    backgroundColor: '#0F172A',
    borderRadius: 24,
    paddingHorizontal: 16,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 6,
  },
  browseMenuIcon: { fontSize: 13 },
  browseMenuText: { color: '#FFFFFF', fontWeight: '800', fontSize: 12, letterSpacing: 0.5 },
  browseMenuBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.6)',
    justifyContent: 'flex-end',
    paddingBottom: 40,
    paddingHorizontal: 16,
  },
  browseMenuCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 18,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 10,
  },
  browseMenuTitle: { fontSize: 16, fontWeight: '800', color: '#0F172A', marginBottom: 12 },
  browseCatRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  browseCatRowActive: { backgroundColor: '#F0FDFA' },
  browseCatName: { fontSize: 14, fontWeight: '600', color: '#334155' },
  browseCatNameActive: { color: '#0D9488', fontWeight: '800' },
  browseCatCount: { fontSize: 13, fontWeight: '700', color: '#94A3B8' },
  floatingCartContainer: { position: 'absolute', bottom: 16, left: 16, right: 16 },
  floatingCartButton: {
    backgroundColor: '#0D9488',
    borderRadius: 14,
    paddingVertical: 13,
    paddingHorizontal: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    shadowColor: '#0D9488',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 6,
  },
  cartCountText: { color: '#FFFFFF', fontWeight: '800', fontSize: 14 },
  cartSubtotalText: { color: '#99F6E4', fontSize: 12, marginTop: 1 },
  viewCartRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  viewCartText: { color: '#FFFFFF', fontWeight: '800', fontSize: 15 },
  viewCartArrow: { color: '#FFFFFF', fontSize: 16, fontWeight: '800' },
});
