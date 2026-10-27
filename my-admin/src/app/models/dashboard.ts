/** Dữ liệu trả về từ GET /api/admin/dashboard?days=7 (my-server/routes/admin-dashboard.js) */
export interface DashboardStat {
  value: number;
  /** % thay đổi so với kỳ trước; null khi kỳ trước = 0 */
  change?: number | null;
}

export interface SalesPoint {
  date: string;
  /** "T2"... "CN" khi xem 7 ngày, "27/10" khi xem 30 ngày */
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
  period: { days: number; from: string; to: string };
  stats: {
    revenue: DashboardStat;
    orders: DashboardStat;
    customers: DashboardStat & { new: number };
    pendingReturns: DashboardStat;
  };
  salesChart: SalesPoint[];
  hotCategories: HotCategory[];
  /** sold: theo số cuốn bán ra | books: chưa có đơn nên tính theo số đầu sách */
  categoryBasis: 'sold' | 'books';
  recentOrders: RecentOrder[];
  inventory: {
    totalBooks: number;
    lowStockCount: number;
    outOfStockCount: number;
    threshold: number;
    lowStock: LowStockBook[];
  };
  /** Tên collection đang dùng; null = MongoDB chưa có collection đó */
  sources: { orders: string | null; users: string | null; refunds: string | null };
}
