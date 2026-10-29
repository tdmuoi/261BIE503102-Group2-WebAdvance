export type AccountTab = 'customers' | 'admins';
export type AccountStatus = string;

export interface AccountStatusOption {
  value: string;
  label: string;
  tone: 'ok' | 'warn' | 'bad' | 'mute' | 'info';
  locked?: boolean;
}

export interface CustomerAccount {
  _id: string;
  fullName: string;
  email: string;
  phone: string | null;
  tier: string | null;
  orderCount: number;
  totalSpent: number;
  points: number | null;
  status: AccountStatus;
  createdAt: string | null;
}

export interface CustomerOrderSummary {
  code: string;
  total: number;
  status: string;
}

export interface CustomerAccountDetail extends CustomerAccount {
  orders: CustomerOrderSummary[];
}

export interface AccountStats {
  newCustomers: number;
  customerChangePercent: number | null;
  activeAccounts: number;
  activeChangePercent: number | null;
  goldMembers: number;
  lockedAccounts: number;
}

export interface AccountList<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
}

export interface CustomerList extends AccountList<CustomerAccount> {
  stats: AccountStats;
  tiers: string[];
  statuses: AccountStatusOption[];
}

export interface AdminAccount {
  _id: string;
  fullName: string;
  email: string;
  roleId: string;
  roleName: string;
  status: AccountStatus;
  emailVerified: boolean;
  lastLoginAt: string | null;
  createdAt: string | null;
}

export interface AdminRole {
  _id: string;
  code: string;
  name: string;
  label: string;
}

export interface Permission {
  _id: string;
  label: string;
}

export interface RolePermissions {
  roles: AdminRole[];
  permissions: Permission[];
  grants: Record<string, string[]>;
}

export interface AdminList extends AccountList<AdminAccount> {
  statuses: AccountStatusOption[];
  roles: RolePermissions;
  activity: AdminActivity[];
  security: LoginSecuritySettings;
}

export interface AdminActivity {
  _id: string;
  actorName: string;
  description: string;
  createdAt: string;
}

export interface LoginSecuritySettings {
  requireTwoFactor: boolean;
  forcePasswordRotation: boolean;
  restrictOfficeIp: boolean;
}

export interface AccountQuery {
  q: string;
  tier: string;
  status: string;
  page: number;
  limit: number;
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