import { Outlet, useLocation } from "react-router-dom";
import { useAdminPermissions } from "@/context/AdminPermissionsContext";
import { permissionForPath } from "@/services/admin-route-permissions";
import BrandedAuthSplash from "./BrandedAuthSplash";
import AdminAccessDenied from "@/pages/AdminAccessDenied";

interface PermissionRouteProps {
  /**
   * Optional explicit permission override. When omitted, the required
   * permission is derived from the current pathname via the route map.
   */
  permission?: string;
}

export default function PermissionRoute({ permission }: PermissionRouteProps) {
  const location = useLocation();
  const { loading, has, isSuper } = useAdminPermissions();

  if (loading) return <BrandedAuthSplash />;

  const required = permission ?? permissionForPath(location.pathname);
  if (!required || isSuper || has(required)) {
    return <Outlet />;
  }

  return <AdminAccessDenied />;
}
