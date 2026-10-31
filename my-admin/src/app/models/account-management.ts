export type AccountTab = 'customers' | 'admins';
export type AccountStatus = string;

export interface AccountStatusOption {
  value: string;
  label: string;
  tone: 'ok' | 'warn' | 'bad' | 'mute' | 'info';
  locked?: boolean;
}

export interface CustomerAccount {
  accountId?: string;
  _id: string;
  fullName: string;
  email: string;
  phone: string | null;
  tier: string | null;
  orderCount: number | null;
  totalSpent: number | null;
  points: number | null;
  status: AccountStatus;
  createdAt: string | null;
}

export interface CustomerOrderSummary {
  _id: string;
  code: string;
  total: number | null;
  status: string;
  createdAt: string | null;
  items: { title: string; image: string; quantity: number; format: string | null }[];
}

export interface CustomerAccountDetail extends CustomerAccount {
  orders: CustomerOrderSummary[];
  returns?: {
    available: boolean;
    items: {
      _id: string;
      code: string;
      status: string;
      amount: number | null;
      createdAt: string | null;
      rating?: number | null;
    }[];
  };
  buybacks?: CustomerAccountDetail['returns'];
  reviews?: CustomerAccountDetail['returns'];
  dataNote?: string;
  ordersAvailable: boolean;
  address: string | null;
  birthday: string | null;
  customerCode: string;
  vip: boolean;
  internalNote: string | null;
  metrics: {
    averageOrderValue: number | null;
    repurchaseRate: number | null;
    booksPurchased: number | null;
    lastPurchaseAt: string | null;
  };
  behavior: null;
  capabilities: { sendEmail: boolean; resetPassword: boolean; lock: boolean };
}

export interface AccountStats {
  newCustomers: number | null;
  customerChangePercent: number | null;
  activeAccounts: number | null;
  activeChangePercent: number | null;
  goldMembers: number | null;
  lockedAccounts: number;
}

export interface AccountList<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
}

export interface CustomerList extends AccountList<CustomerAccount> {
  dataNote?: string;
  stats: AccountStats;
  tiers: string[];
  statuses: AccountStatusOption[];
  capabilities: { sendEmail: boolean; resetPassword: boolean; lock: boolean };
  customerTotal: number;
  adminTotal: number;
}

export interface AdminAccount {
  profileId?: string | null;
  _id: string;
  fullName: string;
  email: string;
  roleId: string;
  roleName: string;
  status: AccountStatus;
  emailVerified: boolean | null;
  twoFactorEnabled: boolean | null;
  isSelf: boolean;
  protected: boolean;
  lastLoginAt: string | null;
  createdAt: string | null;
}

export interface AdminRole {
  _id: string;
  code: string;
  name: string;
  label: string;
  editable: boolean;
  permissionsKnown: boolean;
}

export interface Permission {
  _id: string;
  label: string;
}

export interface RolePermissions {
  moduleActions?: Record<string, Record<string, string[]>>;
  roles: AdminRole[];
  permissions: Permission[];
  grants: Record<string, string[]>;
}

export interface AdminList extends AccountList<AdminAccount> {
  dataNote?: string;
  statuses: AccountStatusOption[];
  roles: RolePermissions;
  activity: AdminActivity[];
  security: LoginSecuritySettings;
  capabilities: { invite: boolean; edit: boolean; remove: boolean; roles: boolean };
  customerTotal: number;
  adminTotal: number;
}

export interface AdminActivity {
  _id: string;
  actorName: string;
  description: string;
  createdAt: string;
}

export interface LoginSecuritySettings {
  requireTwoFactor: boolean | null;
  forcePasswordRotation: boolean | null;
  restrictOfficeIp: boolean | null;
  idleTimeoutMinutes: number | null;
  canUpdate: boolean;
}

export interface AccountQuery {
  q: string;
  tier: string;
  status: string;
  page: number;
  limit: number;
  roleId?: string;
}

export interface AdminAccountRequest {
  fullName: string;
  email: string;
  roleId: string;
  status?: string;
}

export interface CreateRoleRequest {
  code: string;
  name: string;
  description: string;
}
