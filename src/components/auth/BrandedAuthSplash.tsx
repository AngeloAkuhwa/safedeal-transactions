import logo from "@/assets/safedeal-logo.svg";

interface BrandedAuthSplashProps {
  label?: string;
}

const BrandedAuthSplash = ({ label = "Securing your session…" }: BrandedAuthSplashProps) => {
  return (
    <div className="min-h-[100dvh] flex flex-col items-center justify-center bg-background gap-5">
      <img
        src={logo}
        alt="SafeDeal"
        width={80}
        height={80}
        className="h-20 w-20 animate-spin"
        style={{ animationDuration: "2s" }}
      />
      <div className="flex flex-col items-center gap-1">
        <span className="text-xl font-bold text-foreground tracking-tight">SafeDeal</span>
        <span className="text-sm text-muted-foreground animate-pulse">{label}</span>
      </div>
    </div>
  );
};

export default BrandedAuthSplash;