import { describe, expect, it } from "vitest";
import { toggleStateFilter } from "../helpers";
import { DEFAULT_SLA_QUERY } from "@/services/agent-performance.service";

describe("SLA state chip filter", () => {
  it("narrows from all to a single state", () => {
    expect(toggleStateFilter("all", "breached")).toBe("breached");
  });

  it("supports multi-select", () => {
    expect(toggleStateFilter("breached", "at_risk")).toBe("breached,at_risk");
  });

  it("returns to all when the last chip is cleared", () => {
    expect(toggleStateFilter("breached", "breached")).toBe("all");
  });
});

describe("SLA query defaults", () => {
  it("requests no state filter and page one", () => {
    expect(DEFAULT_SLA_QUERY.sla_states).toEqual([]);
    expect(DEFAULT_SLA_QUERY.sla_page).toBe(1);
  });
});