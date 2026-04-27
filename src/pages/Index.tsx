import { Header } from "@/components/landing/Header";
import { HeroSection } from "@/components/landing/HeroSection";
import { FeaturedDealsSection } from "@/components/landing/FeaturedDealsSection";
import { CategoriesSection } from "@/components/landing/CategoriesSection";
import { VerifiedSellersSection } from "@/components/landing/VerifiedSellersSection";
import { WhySaferSection } from "@/components/landing/WhySaferSection";
import { MarketplaceVsDirectSection } from "@/components/landing/MarketplaceVsDirectSection";
import { HowItWorks } from "@/components/landing/HowItWorks";
import { ProtectionSection } from "@/components/landing/ProtectionSection";
import { TransparencyTrustSection } from "@/components/landing/TransparencyTrustSection";
import { PowerfulFeaturesSection } from "@/components/landing/PowerfulFeaturesSection";
import { TrustSafetySection } from "@/components/landing/TrustSafetySection";
import { NeedHelpSection } from "@/components/landing/NeedHelpSection";
import { FAQSection } from "@/components/landing/FAQSection";
import { CTASection } from "@/components/landing/CTASection";
import { Footer } from "@/components/landing/Footer";

const Index = () => {
  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <main className="flex-1">
        {/* 1. Header is above */}
        {/* 2. Hero */}
        <HeroSection />
        {/* 3. Featured protected deals */}
        <FeaturedDealsSection />
        {/* 4. Shop by category */}
        <CategoriesSection />
        {/* 5. Shop from verified sellers */}
        <VerifiedSellersSection />
        {/* 6. Why SafeDeal feels safer */}
        <WhySaferSection />
        {/* 7. Built for marketplace and direct deals */}
        <MarketplaceVsDirectSection />
        {/* 8. How SafeDeal Works */}
        <HowItWorks />
        {/* 9. Your money stays protected until you're satisfied */}
        <ProtectionSection />
        {/* 10. Built on transparency and trust */}
        <TransparencyTrustSection />
        {/* 11. Powerful features for secure transactions */}
        <PowerfulFeaturesSection />
        {/* 12. Trust & Safety */}
        <TrustSafetySection />
        {/* 13. Need Help? */}
        <NeedHelpSection />
        {/* 14. FAQ */}
        <FAQSection />
        {/* 15. Final CTA */}
        <CTASection />
      </main>
      {/* 16. Footer */}
      <Footer />
    </div>
  );
};

export default Index;
