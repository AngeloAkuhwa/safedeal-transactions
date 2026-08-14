import { Header } from "@/components/landing/Header";
import { HeroSection } from "@/components/landing/HeroSection";
import { FeaturedDealsSection } from "@/components/landing/FeaturedDealsSection";
import { VerifiedSellersSection } from "@/components/landing/VerifiedSellersSection";
import { ProtectionSection } from "@/components/landing/ProtectionSection";
import { FeesSection } from "@/components/landing/FeesSection";
import { FAQSection } from "@/components/landing/FAQSection";
import { CTASection } from "@/components/landing/CTASection";
import { Footer } from "@/components/landing/Footer";
import { BackToTop } from "@/components/landing/BackToTop";
import { ScrollProgressBar } from "@/components/landing/ScrollProgressBar";
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
      <ScrollProgressBar />
      <Header />
      <main className="flex-1">
        <HeroSection />
        <FeaturedDealsSection />
        <VerifiedSellersSection />
        <ProtectionSection />
        <FeesSection />
        <FAQSection />
        <CTASection />
      </main>
      <Footer />
      <BackToTop />
    </div>
  );
};

export default Index;
