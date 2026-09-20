import { QueryResultRow, QueryResult, PoolClient, Pool } from 'pg';

declare const pool: Pool;
declare const db: {
    query: <T extends QueryResultRow = any>(text: string, params?: any[]) => Promise<QueryResult<T>>;
    /**
     * Executes callback within a Serializable PostgreSQL Transaction.
     * Perfect for payment processing and sequential lock enforcement.
     */
    withTransaction: <T>(callback: (client: PoolClient) => Promise<T>, isolationLevel?: "READ COMMITTED" | "SERIALIZABLE") => Promise<T>;
    close: () => Promise<void>;
};

interface NearestRiderResult {
    id: string;
    fullName: string;
    phone: string;
    vehicleType: string;
    distanceMeters: number;
}
interface NearbyRestaurantResult {
    id: string;
    name: string;
    slug: string;
    address: string;
    phone: string;
    rating: number;
    cuisine: string[];
    imageUrl?: string;
    distanceMeters: number;
    isAcceptingOrders: boolean;
    latitude: number;
    longitude: number;
}
interface TrendingDishResult {
    id: string;
    name: string;
    description?: string;
    pricePaise: number;
    imageUrl?: string;
    isVeg: boolean;
    restaurantId: string;
    restaurantName: string;
    category: string;
    distanceMeters: number;
    orderVelocity?: number;
}
/**
 * Sequential 1-to-1 Rider Dispatch Query:
 * Selects the single nearest available online rider within radius (default 4km)
 * excluding any riders who already rejected this order.
 */
declare function findNearestOnlineRider(latitude: number, longitude: number, rejectedRiderIds?: string[], maxDistanceMeters?: number): Promise<NearestRiderResult | null>;
/**
 * Hyperlocal Nearby Restaurant Discovery:
 * Finds active restaurants within radius (default 7km) ordered by proximity.
 */
declare function findRestaurantsWithinRadius(latitude: number, longitude: number, radiusMeters?: number, limit?: number): Promise<NearbyRestaurantResult[]>;
/**
 * Hyperlocal Trending Dishes Near Customer:
 * Discovers velocity-ranked popular dishes from active restaurants within radius (default 5km),
 * optionally filtered by active meal slot, with restaurant diversity windowing (max 2 dishes per restaurant).
 */
declare function findTrendingDishesNearLocation(latitude: number, longitude: number, radiusMeters?: number, mealSlot?: string, limit?: number): Promise<TrendingDishResult[]>;

declare function seedDatabase(): Promise<void>;

export { type NearbyRestaurantResult, type NearestRiderResult, type TrendingDishResult, db, findNearestOnlineRider, findRestaurantsWithinRadius, findTrendingDishesNearLocation, pool, seedDatabase };
