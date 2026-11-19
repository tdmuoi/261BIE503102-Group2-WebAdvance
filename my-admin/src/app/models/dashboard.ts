export interface DashboardStat {
  value: number;
  change?: number | null;
}

export interface SalesPoint {
  date: string;
  label: string;
  revenue: number;
  orders: number;
}

export interface HotCategory {
  name: string;
  value: number;
  percent: number;
}

export interface RecentOrder {
  _id: string;
  code: string;
  customerName: string;
  createdAt: string | null;
  total: number;
  status: string;
}

export interface LowStockBook {
  _id: string;
  title: string;
  image: string | null;
  stock: number;
}

export interface DashboardData {
  reportingPolicy?: string;
  excludedUnverifiedPayments?: number;
  period: { days: number; from: string; to: string };
  stats: {
    revenue: DashboardStat;
    orders: DashboardStat;
    customers: DashboardStat & { new: number };
    pendingReturns: DashboardStat;
  };
  salesChart: SalesPoint[];
  hotCategories: HotCategory[];
  categoryBasis: 'sold' | 'books';
  recentOrders: RecentOrder[];
  inventory: {
    totalBooks: number;
    lowStockCount: number;
    outOfStockCount: number;
    threshold: number;
    lowStock: LowStockBook[];
  };
  sources: { orders: string | null; users: string | null; refunds: string | null };
}
