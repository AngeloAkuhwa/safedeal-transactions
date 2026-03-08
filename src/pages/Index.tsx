import { Header } from "@/components/landing/Header";
import { HeroSection } from "@/components/landing/HeroSection";
import { FraudPrevention } from "@/components/landing/FraudPrevention";
import { BestForSection } from "@/components/landing/BestForSection";
import { TrustBanner } from "@/components/landing/TrustBanner";
import { HowItWorks } from "@/components/landing/HowItWorks";
import { ProtectionSection } from "@/components/landing/ProtectionSection";
import { TrustSection } from "@/components/landing/TrustSection";
import { FeaturesGrid } from "@/components/landing/FeaturesGrid";
import { CTASection } from "@/components/landing/CTASection";
import { FAQSection } from "@/components/landing/FAQSection";
import { Footer } from "@/components/landing/Footer";

const Index = () => {
  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <main className="flex-1">
        <HeroSection />
        <FraudPrevention />
        <BestForSection />
        <TrustBanner />
        <HowItWorks />
        <ProtectionSection />
        <TrustSection />
        <FeaturesGrid />
        <CTASection />
        <FAQSection />
      </main>
      <Footer />
    </div>
  );
};

export default Index;
