import { isValidElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { Contradictions } from "@/components/Contradictions";
import type { Contradiction } from "@/lib/types";

const conflict: Contradiction = {
  id: "c01",
  topic: "Units sold",
  claims: [
    { articleId: "a", factId: "f01", quote: "The company sold 12,000 units in 2026." },
    { articleId: "b", factId: "f02", quote: "The company sold 9,500 units in 2026." },
  ],
};

function buttons(node: ReactNode): Array<{ props: { children?: ReactNode; onClick?: () => void } }> {
  if (Array.isArray(node)) return node.flatMap(buttons);
  if (!isValidElement<{ children?: ReactNode }>(node)) return [];
  const own = node.type === "button" ? [node as { props: { children?: ReactNode; onClick?: () => void } }] : [];
  return [...own, ...buttons(node.props.children)];
}

describe("Conflicting claims", () => {
  it("shows both original quotes and a neutral explanation", () => {
    const html = renderToStaticMarkup(
      <Contradictions contradictions={[conflict]} sourceName={(id) => id === "a" ? "Outlet A" : "Outlet B"} onPick={() => {}} />,
    );
    expect(html).toContain("Conflicting claims");
    expect(html).toContain("neither is marked as correct");
    expect(html).toContain(conflict.claims[0].quote);
    expect(html).toContain(conflict.claims[1].quote);
    expect(html).toContain("Outlet A");
    expect(html).toContain("Outlet B");
  });

  it("opens the cited source and fact from either quote", () => {
    const onPick = vi.fn();
    const tree = Contradictions({ contradictions: [conflict], sourceName: (id) => id.toUpperCase(), onPick });
    for (const button of buttons(tree)) button.props.onClick?.();
    expect(onPick.mock.calls).toEqual([["a", "f01"], ["b", "f02"]]);
  });

  it("renders nothing when the model finds no clear conflict", () => {
    expect(Contradictions({ contradictions: [], sourceName: String, onPick: () => {} })).toBeNull();
  });
});
