import { ShieldCheck, Mail, Phone, UserCheck } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { resolveClaim } from "@/lib/trust/trust-claims";

interface PublicStorefrontHeaderProps {
  seller: {
    full_name: string;
    avatar_url?: string | null;
    store_slug: string;
    verification_level: string;
    email_verified: boolean;
    phone_verified: boolean;
    identity_verified: boolean;
  };
  productCount: number;
}

export function PublicStorefrontHeader({ seller, productCount }: PublicStorefrontHeaderProps) {
  const initials = seller.full_name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <div className="bg-primary/5 border-b">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
        <div className="flex items-center gap-4 sm:gap-6 mb-4">
          <Avatar className="h-16 w-16 sm:h-20 sm:w-20 border-2 border-primary/20">
            <AvatarImage src={seller.avatar_url ?? undefined} alt={seller.full_name} />
            <AvatarFallback className="text-lg sm:text-xl font-bold">{initials}</AvatarFallback>
          </Avatar>
          <div>
            <h1 className="h-page font-bold text-foreground">{seller.full_name}</h1>
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              {seller.identity_verified && (
                <Badge variant="outline" className="bg-primary/10 text-primary border-primary/20 gap-1">
                  <ShieldCheck className="h-3 w-3" />
                  {resolveClaim("SELLER_VERIFIED", { identityVerified: seller.identity_verified })}
                </Badge>
              )}
              <span className="text-sm text-muted-foreground">
                {productCount} product{productCount !== 1 ? "s" : ""}
              </span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          {seller.email_verified && (
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <Mail className="h-3.5 w-3.5" />
              Email confirmed
            </div>
          )}
          {seller.phone_verified && (
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <Phone className="h-3.5 w-3.5" />
              Phone confirmed
            </div>
          )}
          {seller.identity_verified && (
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <UserCheck className="h-3.5 w-3.5 text-primary" />
              {resolveClaim("SELLER_ID_VERIFIED", { identityVerified: seller.identity_verified })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
