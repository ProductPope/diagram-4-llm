import { cleanup, render } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";

import { textLength, writeOut } from "./typewriter";

function Picture() {
  return <svg aria-label="Picture" />;
}

const answer = (
  <>
    <p>
      A map, <em>not</em> a scroll.
    </p>
    <Picture />
    <ul>
      {["one", "two"].map((item) => (
        <li key={item}>{item}</li>
      ))}
    </ul>
  </>
);
// "A map, " + "not" + " a scroll." + the picture + "one" + "two"
const LENGTH = 7 + 3 + 10 + 1 + 3 + 3;

afterEach(() => {
  cleanup();
});

function shown(length: number) {
  return render(<>{writeOut(answer, length)}</>).container;
}

it("counts the text, and each element without children as one character", () => {
  expect(textLength(answer)).toBe(LENGTH);
});

it("shows the text up to the length, cutting inside nested elements", () => {
  const container = shown(9);
  expect(container.textContent).toBe("A map, no");
  expect(container.querySelector("em")?.textContent).toBe("no");
});

it("leaves out the elements the text has not reached", () => {
  const container = shown(20);
  expect(container.textContent).toBe("A map, not a scroll.");
  expect(container.querySelector("svg")).toBeNull();
  expect(container.querySelector("ul")).toBeNull();

  expect(shown(21).querySelector("svg")).not.toBeNull();
  expect(shown(22).querySelectorAll("li")).toHaveLength(1);
});

it("shows everything at the full length", () => {
  const whole = render(answer).container.innerHTML;
  expect(shown(LENGTH).innerHTML).toBe(whole);
  expect(shown(LENGTH + 100).innerHTML).toBe(whole);
});

it("shows nothing at length zero", () => {
  expect(shown(0).innerHTML).toBe("");
});
