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
import { FAQSection } from "@/components/landing/FAQSection";
import { CTASection } from "@/components/landing/CTASection";
import { Footer } from "@/components/landing/Footer";

const Index = () => {
  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <main className="flex-1">
        <HeroSection />
        <FeaturedDealsSection />
        <CategoriesSection />
        <VerifiedSellersSection />
        <WhySaferSection />
        <MarketplaceVsDirectSection />
        <HowItWorks />
        <ProtectionSection />
        {/* Consolidated: trust + safety + features merged into one compact grid */}
        <TransparencyTrustSection />
        <FAQSection />
        <CTASection />
      </main>
      <Footer />
    </div>
  );
};

export default Index;
