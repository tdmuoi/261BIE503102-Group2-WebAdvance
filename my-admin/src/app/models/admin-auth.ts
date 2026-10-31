export interface AdminUser {
  _id: string;
  fullName: string;
  email: string;
  role: 'admin' | 'superadmin';
  roleCode?: string;
  roleName?: string;
  profileId?: string | null;
  permissions?: { module: string; actions: string[] }[];
}

export interface AdminSession {
  user: AdminUser;
  csrfToken: string;
  expiresAt: string;
}

export interface AdminLoginRequest {
  email: string;
  password: string;
  rememberMe: boolean;
}
