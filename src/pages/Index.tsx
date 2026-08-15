import { Header } from "@/components/landing/Header";
import { HeroSection } from "@/components/landing/HeroSection";
import { HowItWorks } from "@/components/landing/HowItWorks";
import { PowerfulFeaturesSection } from "@/components/landing/PowerfulFeaturesSection";
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
    title: "SafeDeal — Escrow for every online deal",
    description:
      "SafeDeal holds the buyer's payment in escrow until the item is delivered and confirmed. Protected transactions for sellers and buyers online.",
    path: "/",
    jsonLd: {
      "@context": "https://schema.org",
      "@type": "Organization",
      name: "SafeDeal",
      url: "https://trust-link-secure.lovable.app",
      description:
        "Escrow and transaction protection for online buyers and sellers.",
      areaServed: "NG",
    },
  });

  return (
    <div className="flex min-h-[100dvh] flex-col">
      <ScrollProgressBar />
      <Header />
      <main className="flex-1 pb-8">
        <HeroSection />
        <HowItWorks />
        <PowerfulFeaturesSection />
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
