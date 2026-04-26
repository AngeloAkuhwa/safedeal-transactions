import { Header } from "@/components/landing/Header";
import { HeroSection } from "@/components/landing/HeroSection";
import { MarketplacePreview } from "@/components/landing/MarketplacePreview";
import { CategoriesSection } from "@/components/landing/CategoriesSection";
import { VerifiedSellersSection } from "@/components/landing/VerifiedSellersSection";
import { FraudPrevention } from "@/components/landing/FraudPrevention";
import { BestForSection } from "@/components/landing/BestForSection";
import { TrustBanner } from "@/components/landing/TrustBanner";
import { HowItWorks } from "@/components/landing/HowItWorks";
import { BuyerTrustSection } from "@/components/landing/BuyerTrustSection";
import { ProtectionSection } from "@/components/landing/ProtectionSection";
import { TrustSection } from "@/components/landing/TrustSection";
import { FeaturesGrid } from "@/components/landing/FeaturesGrid";
import { StatusBadgesSection } from "@/components/landing/StatusBadgesSection";
import { CTASection } from "@/components/landing/CTASection";
import { FAQSection } from "@/components/landing/FAQSection";
import { Footer } from "@/components/landing/Footer";

const Index = () => {
  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <main className="flex-1">
        <HeroSection />
        <MarketplacePreview />
        <CategoriesSection />
        <VerifiedSellersSection />
        <FraudPrevention />
        <BestForSection />
        <TrustBanner />
        <HowItWorks />
        <BuyerTrustSection />
        <ProtectionSection />
        <TrustSection />
        <FeaturesGrid />
        <StatusBadgesSection />
        <CTASection />
        <FAQSection />
      </main>
      <Footer />
    </div>
  );
};

export default Index;
