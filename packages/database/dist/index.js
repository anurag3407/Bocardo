"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/index.ts
var index_exports = {};
__export(index_exports, {
  db: () => db,
  findNearestOnlineRider: () => findNearestOnlineRider,
  findRestaurantsWithinRadius: () => findRestaurantsWithinRadius,
  findTrendingDishesNearLocation: () => findTrendingDishesNearLocation,
  pool: () => pool,
  seedDatabase: () => seedDatabase
});
module.exports = __toCommonJS(index_exports);

// src/client.ts
var import_pg = require("pg");
var import_dotenv = __toESM(require("dotenv"));
import_dotenv.default.config();
var connectionString = process.env.DATABASE_URL || "postgresql://postgres:postgres@localhost:5432/bocardo";
var pool = new import_pg.Pool({
  connectionString,
  max: 20,
  idleTimeoutMillis: 3e4,
  connectionTimeoutMillis: 5e3
});
var db = {
  query: async (text, params) => {
    const start = Date.now();
    try {
      const res = await pool.query(text, params);
      const duration = Date.now() - start;
      if (process.env.NODE_ENV === "development" && duration > 500) {
        console.warn(`[DB Slow Query] ${duration}ms: ${text.slice(0, 100)}`);
      }
      return res;
    } catch (error) {
      console.error("[DB Query Error]", { error: error instanceof Error ? error.name : "UnknownError" });
      throw error;
    }
  },
  /**
   * Executes callback within a Serializable PostgreSQL Transaction.
   * Perfect for payment processing and sequential lock enforcement.
   */
  withTransaction: async (callback, isolationLevel = "SERIALIZABLE") => {
    const client = await pool.connect();
    try {
      await client.query(`BEGIN TRANSACTION ISOLATION LEVEL ${isolationLevel}`);
      const result = await callback(client);
      await client.query("COMMIT");
      return result;
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  },
  close: async () => {
    await pool.end();
  }
};

// src/geo.ts
async function findNearestOnlineRider(latitude, longitude, rejectedRiderIds = [], maxDistanceMeters = 4e3) {
  const sql = `
    SELECT u.id,
           u.full_name as "fullName",
           u.phone,
           rp.vehicle_type as "vehicleType",
           ST_Distance(rp.last_location, ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography) AS "distanceMeters"
    FROM users u
    JOIN rider_profiles rp ON u.id = rp.user_id
    WHERE u.role = 'RIDER' 
      AND rp.is_online = TRUE 
      AND rp.active_order_id IS NULL
      AND u.is_suspended = FALSE
      AND rp.updated_at > NOW() - INTERVAL '300 seconds'
      AND NOT (u.id = ANY($3::uuid[]))
      AND ST_DWithin(rp.last_location, ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography, $4)
    ORDER BY "distanceMeters" ASC
    LIMIT 1;
  `;
  const res = await db.query(sql, [
    longitude,
    latitude,
    rejectedRiderIds,
    maxDistanceMeters
  ]);
  return res.rows[0] || null;
}
async function findRestaurantsWithinRadius(latitude, longitude, radiusMeters = 7e3, limit = 20) {
  const sql = `
    SELECT r.id,
           r.name,
           r.slug,
           r.address,
           r.phone,
           r.rating::float,
           r.cuisine,
           r.image_url as "imageUrl",
           r.is_accepting_orders as "isAcceptingOrders",
           ST_Y(r.location::geometry) as latitude,
           ST_X(r.location::geometry) as longitude,
           ST_Distance(r.location, ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography) AS "distanceMeters"
    FROM restaurants r
    WHERE r.is_active = TRUE
      AND ST_DWithin(r.location, ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography, $3)
    ORDER BY "distanceMeters" ASC
    LIMIT $4;
  `;
  const res = await db.query(sql, [
    longitude,
    latitude,
    radiusMeters,
    limit
  ]);
  return res.rows;
}
async function findTrendingDishesNearLocation(latitude, longitude, radiusMeters = 5e3, mealSlot, limit = 10) {
  const params = [longitude, latitude, radiusMeters];
  let slotFilter = "";
  if (mealSlot) {
    params.push(mealSlot);
    slotFilter = `AND $4 = ANY(d.meal_slots)`;
  }
  params.push(limit);
  const limitParamIndex = params.length;
  const sql = `
    WITH dish_popularity AS (
      SELECT d.id,
             d.name,
             d.description,
             d.price_paise as "pricePaise",
             d.image_url as "imageUrl",
             d.is_veg as "isVeg",
             d.restaurant_id as "restaurantId",
             r.name as "restaurantName",
             d.category,
             r.rating::float as rating,
             ST_Distance(r.location, ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography) AS "distanceMeters",
             COALESCE(sales.velocity, 0) as "orderVelocity",
             ROW_NUMBER() OVER (
               PARTITION BY d.restaurant_id 
               ORDER BY COALESCE(sales.velocity, 0) DESC, d.price_paise DESC
             ) as rest_dish_rank
      FROM dishes d
      JOIN restaurants r ON d.restaurant_id = r.id
      LEFT JOIN (
        SELECT oi.dish_id, COUNT(oi.id) as velocity
        FROM order_items oi
        JOIN orders o ON oi.order_id = o.id
        WHERE o.created_at >= NOW() - INTERVAL '7 days'
          AND o.status NOT IN ('CANCELLED_BY_CUSTOMER', 'CANCELLED_BY_KITCHEN', 'CANCELLED_BY_SYSTEM', 'PAYMENT_PENDING')
        GROUP BY oi.dish_id
      ) sales ON sales.dish_id = d.id
      WHERE d.is_available = TRUE
        AND r.is_active = TRUE
        AND r.is_accepting_orders = TRUE
        AND ST_DWithin(r.location, ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography, $3)
        ${slotFilter}
    )
    SELECT id,
           name,
           description,
           "pricePaise",
           "imageUrl",
           "isVeg",
           "restaurantId",
           "restaurantName",
           category,
           "distanceMeters",
           "orderVelocity"
    FROM dish_popularity
    WHERE rest_dish_rank <= 2
    ORDER BY "orderVelocity" DESC, rating DESC, "distanceMeters" ASC
    LIMIT $${limitParamIndex};
  `;
  const res = await db.query(sql, params);
  return res.rows;
}

// src/seed.ts
async function seedDatabase() {
  console.log("\u{1F331} Starting Bocardo platform database seeding...");
  try {
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
    const riderUser = await db.query(`
      INSERT INTO users (clerk_id, email, phone, full_name, role)
      VALUES ('user_clerk_rider_1', 'rider1@bocardo.in', '+919876500003', 'Ramesh Kumar', 'RIDER')
      ON CONFLICT (clerk_id) DO UPDATE SET full_name = EXCLUDED.full_name
      RETURNING id;
    `);
    const riderId = riderUser.rows[0].id;
    await db.query(`
      INSERT INTO rider_profiles (user_id, is_online, vehicle_type, last_location, rating)
      VALUES ($1, TRUE, 'MOTORCYCLE', ST_SetSRID(ST_MakePoint(77.6408, 12.9716), 4326)::geography, 4.9)
      ON CONFLICT (user_id) DO UPDATE SET is_online = TRUE, last_location = EXCLUDED.last_location;
    `, [riderId]);
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
    await db.query(`
      INSERT INTO dish_pair_associations (dish_id_a, dish_id_b, co_occurrence_count)
      VALUES 
        ($1, $2, 142),
        ($1, $3, 98)
      ON CONFLICT (dish_id_a, dish_id_b) DO UPDATE SET co_occurrence_count = EXCLUDED.co_occurrence_count;
    `, [dish1Id, dish2Id, dish3Id]);
    console.log("\u2705 Seeding completed successfully!");
    console.log(`- Admin ID: ${adminId}`);
    console.log(`- Restaurant 1: ${rest1Id}`);
    console.log(`- Restaurant 2: ${rest2Id}`);
    console.log(`- Rider ID: ${riderId}`);
  } catch (error) {
    console.error("\u274C Seeding failed:", error);
  }
}
if (require.main === module) {
  seedDatabase().then(() => process.exit(0));
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  db,
  findNearestOnlineRider,
  findRestaurantsWithinRadius,
  findTrendingDishesNearLocation,
  pool,
  seedDatabase
});
