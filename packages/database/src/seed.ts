import { db } from './client';

export async function seedDatabase() {
  console.log('🌱 Starting Bocardo platform database seeding...');

  try {
    // 1. Create Admin & Restaurant Owners
    const adminUser = await db.query(`
      INSERT INTO users (clerk_id, email, phone, full_name, role)
      VALUES ('user_clerk_admin_1', 'admin@bocardo.in', '+919876500001', 'Bocardo Operations Admin', 'ADMIN')
      ON CONFLICT (clerk_id) DO UPDATE SET full_name = EXCLUDED.full_name
      RETURNING id;
    `);
    const adminId = adminUser.rows[0].id;

    const ownerUser = await db.query(`
      INSERT INTO users (clerk_id, email, phone, full_name, role)
      VALUES ('user_clerk_owner_1', 'partner@biryanibliss.com', '+919876500002', 'Chef Sanjeev Kapoor', 'RESTAURANT')
      ON CONFLICT (clerk_id) DO UPDATE SET full_name = EXCLUDED.full_name
      RETURNING id;
    `);
    const ownerId = ownerUser.rows[0].id;

    // 2. Create Riders
    const riderUser = await db.query(`
      INSERT INTO users (clerk_id, email, phone, full_name, role)
      VALUES ('user_clerk_rider_1', 'rider1@bocardo.in', '+919876500003', 'Ramesh Kumar', 'RIDER')
      ON CONFLICT (clerk_id) DO UPDATE SET full_name = EXCLUDED.full_name
      RETURNING id;
    `);
    const riderId = riderUser.rows[0].id;

    // Create Rider Profile in Bangalore Indiranagar coordinates (77.6408, 12.9716)
    await db.query(`
      INSERT INTO rider_profiles (user_id, is_online, vehicle_type, last_location, rating)
      VALUES ($1, TRUE, 'MOTORCYCLE', ST_SetSRID(ST_MakePoint(77.6408, 12.9716), 4326)::geography, 4.9)
      ON CONFLICT (user_id) DO UPDATE SET is_online = TRUE, last_location = EXCLUDED.last_location;
    `, [riderId]);

    // 3. Create Sample Restaurants in Bangalore
    const rest1 = await db.query(`
      INSERT INTO restaurants (owner_id, name, slug, phone, location, address, gstin, commission_rate, rating, cuisine, image_url)
      VALUES (
        $1,
        'Biryani Bliss & Kebabs',
        'biryani-bliss-indiranagar',
        '+918041234567',
        ST_SetSRID(ST_MakePoint(77.6412, 12.9719), 4326)::geography,
        '100 Feet Rd, HAL 2nd Stage, Indiranagar, Bengaluru, Karnataka 560038',
        '29AAAAA0000A1Z5',
        15.00,
        4.6,
        ARRAY['Biryani', 'Mughlai', 'Kebabs'],
        'https://images.unsplash.com/photo-1563379091339-03b21ab4a4f8?w=800'
      )
      ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name
      RETURNING id;
    `, [ownerId]);
    const rest1Id = rest1.rows[0].id;

    const rest2 = await db.query(`
      INSERT INTO restaurants (owner_id, name, slug, phone, location, address, gstin, commission_rate, rating, cuisine, image_url)
      VALUES (
        $1,
        'South Kitchen Tiffin Express',
        'south-kitchen-indiranagar',
        '+918049876543',
        ST_SetSRID(ST_MakePoint(77.6385, 12.9740), 4326)::geography,
        '12th Main Rd, Indiranagar, Bengaluru, Karnataka 560008',
        '29BBBBB1111B2Z6',
        12.50,
        4.4,
        ARRAY['South Indian', 'Breakfast', 'Dosa'],
        'https://images.unsplash.com/photo-1610192244261-3f33de3f55e4?w=800'
      )
      ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name
      RETURNING id;
    `, [ownerId]);
    const rest2Id = rest2.rows[0].id;

    // 4. Create Dishes (in integer paise e.g. ₹320 = 32000 paise)
    const dish1 = await db.query(`
      INSERT INTO dishes (restaurant_id, name, description, price_paise, is_veg, meal_slots, category, image_url)
      VALUES ($1, 'Hyderabadi Dum Biryani', 'Slow-cooked fragrant basmati rice with succulent spices and tender meat/veg options.', 32000, false, ARRAY['LUNCH', 'DINNER', 'LATE_NIGHT'], 'Biryani', 'https://images.unsplash.com/photo-1563379091339-03b21ab4a4f8?w=600')
      RETURNING id;
    `, [rest1Id]);
    const dish1Id = dish1.rows[0].id;

    const dish2 = await db.query(`
      INSERT INTO dishes (restaurant_id, name, description, price_paise, is_veg, meal_slots, category, image_url)
      VALUES ($1, 'Burani Raita & Salan', 'Garlic infused thick curd raita with traditional spicy mirchi ka salan.', 6000, true, ARRAY['LUNCH', 'DINNER'], 'Accompaniments', 'https://images.unsplash.com/photo-1546833999-b9f581a1996d?w=600')
      RETURNING id;
    `, [rest1Id]);
    const dish2Id = dish2.rows[0].id;

    const dish3 = await db.query(`
      INSERT INTO dishes (restaurant_id, name, description, price_paise, is_veg, meal_slots, category, image_url)
      VALUES ($1, 'Gulab Jamun (2 Pcs)', 'Melt-in-mouth golden milk-solid dumplings in aromatic saffron-cardamom syrup.', 8000, true, ARRAY['LUNCH', 'DINNER', 'SNACKS'], 'Desserts', 'https://images.unsplash.com/photo-1601050690597-df0568f70950?w=600')
      RETURNING id;
    `, [rest1Id]);
    const dish3Id = dish3.rows[0].id;

    // 5. Seed Co-occurrence Matrix for Cart Recommendations ("Frequently Bought Together")
    await db.query(`
      INSERT INTO dish_pair_associations (dish_id_a, dish_id_b, co_occurrence_count)
      VALUES 
        ($1, $2, 142),
        ($1, $3, 98)
      ON CONFLICT (dish_id_a, dish_id_b) DO UPDATE SET co_occurrence_count = EXCLUDED.co_occurrence_count;
    `, [dish1Id, dish2Id, dish3Id]);

    console.log('✅ Seeding completed successfully!');
    console.log(`- Admin ID: ${adminId}`);
    console.log(`- Restaurant 1: ${rest1Id}`);
    console.log(`- Restaurant 2: ${rest2Id}`);
    console.log(`- Rider ID: ${riderId}`);
  } catch (error) {
    console.error('❌ Seeding failed:', error);
  }
}

if (require.main === module) {
  seedDatabase().then(() => process.exit(0));
}
