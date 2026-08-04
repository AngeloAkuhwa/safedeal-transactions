import { Header } from "@/components/landing/Header";
import { HeroSection } from "@/components/landing/HeroSection";
import { FeaturedDealsSection } from "@/components/landing/FeaturedDealsSection";
import { CategoriesSection } from "@/components/landing/CategoriesSection";
import { VerifiedSellersSection } from "@/components/landing/VerifiedSellersSection";
import { WhySaferSection } from "@/components/landing/WhySaferSection";
import { MarketplaceVsDirectSection } from "@/components/landing/MarketplaceVsDirectSection";
import { HowItWorks } from "@/components/landing/HowItWorks";
import { ProtectionSection } from "@/components/landing/ProtectionSection";
import { PowerfulFeaturesSection } from "@/components/landing/PowerfulFeaturesSection";
import { FAQSection } from "@/components/landing/FAQSection";
import { CTASection } from "@/components/landing/CTASection";
import { Footer } from "@/components/landing/Footer";
import { BackToTop } from "@/components/landing/BackToTop";
import { usePageMeta } from "@/hooks/usePageMeta";

const Index = () => {
  usePageMeta({
    title: "SafeDeal — Buy Safely, Sell Confidently",
    description:
      "SafeDeal holds buyer payments in escrow until delivery is confirmed. Protected transactions, verified sellers, and dispute resolution for buyers and sellers in Lagos, Nigeria.",
    path: "/",
    jsonLd: {
      "@context": "https://schema.org",
      "@type": "Organization",
      name: "SafeDeal",
      url: "https://trust-link-secure.lovable.app",
      description:
        "Transaction protection and escrow for online buyers and sellers in Nigeria.",
      areaServed: "NG",
    },
  });

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
        <PowerfulFeaturesSection />
        <FAQSection />
        <CTASection />
      </main>
      <Footer />
      <BackToTop />
    </div>
  );
};

export default Index;
