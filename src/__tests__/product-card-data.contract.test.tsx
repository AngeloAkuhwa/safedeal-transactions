/**
 * The product card states facts and never invents them (plan 2.1b).
 *
 * The card's anatomy reserved two elements the backend could not serve when
 * it was built: social proof and location. Now that it serves both (sold
 * counts measured from completed transactions, location from the seller's
 * profile), the risk inverts: the failure mode is no longer a missing
 * element but a fabricated one. "0 sold" under every product on a young
 * marketplace is the absence of social proof shouted, and an empty
 * location slot rendered as a dangling separator is furniture pretending
 * to be data.
 *
 * So this renders the real card and asserts presence AND absence: the
 * claims appear exactly when the fact exists, and the meta line leaves the
 * tree entirely when neither does.
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { BuyerProductCard } from "@/components/product/BuyerProductCard";

const product = (over: Record<string, unknown> = {}) => ({
  id: "p1",
  title: "Woven raffia tote",
  unit_price: 18500,
  currency_code: "NGN",
  ...over,
});

const renderCard = (
  productOver: Record<string, unknown> = {},
  seller?: Parameters<typeof BuyerProductCard>[0]["seller"],
) =>
  render(
    <BuyerProductCard
      product={product(productOver)}
      seller={seller}
      outOfStock={false}
      lowStock={false}
    />,
  );

afterEach(cleanup);

describe("product card sold count", () => {
  it("shows the count when sales exist", () => {
    const { container } = renderCard({ sold_count: 7 });
    expect(container.textContent).toContain("7 sold");
  });

  it("renders nothing at zero: '0 sold' is not social proof", () => {
    const { container } = renderCard({ sold_count: 0 });
    expect(container.textContent).not.toContain("sold");
  });

  it("renders nothing when the backend did not send a count", () => {
    const { container } = renderCard();
    expect(container.textContent).not.toContain("sold");
  });
});

describe("product card location", () => {
  it("shows city and state when the seller profile has them", () => {
    const { container } = renderCard({}, {
      full_name: "Ada",
      city_name: "Ikeja",
      state_name: "Lagos",
    });
    expect(container.textContent).toContain("Ikeja, Lagos");
  });

  it("shows a lone state without a dangling comma", () => {
    const { container } = renderCard({}, {
      full_name: "Ada",
      city_name: null,
      state_name: "Lagos",
    });
    expect(container.textContent).toContain("Lagos");
    expect(container.textContent).not.toContain(", Lagos");
  });

  it("invents no geography when the profile has none", () => {
    const { container } = renderCard({ sold_count: 3 }, { full_name: "Ada" });
    expect(container.textContent).toContain("3 sold");
    // No separator dot may trail the sold claim when location is absent.
    expect(container.textContent).not.toContain("·");
  });
});

describe("the meta line as a whole", () => {
  it("joins both facts with one separator when both exist", () => {
    const { container } = renderCard({ sold_count: 12 }, {
      full_name: "Ada",
      city_name: "Ikeja",
      state_name: "Lagos",
    });
    expect(container.textContent).toContain("12 sold");
    expect(container.textContent).toContain("·");
    expect(container.textContent).toContain("Ikeja, Lagos");
  });

  it("leaves the tree entirely when neither fact exists", () => {
    const { container } = renderCard({}, { full_name: "Ada" });
    expect(container.textContent).not.toContain("sold");
    expect(container.textContent).not.toContain("·");
  });
});
