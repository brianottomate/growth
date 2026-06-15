// Blocking anti-FOUC theme detector. Rendered once from the server layout (NOT
// from the client ThemeProvider — a <script> inside a client component never
// executes on the client and React 19 warns about it). Self-contained so it can
// be imported by the server component without crossing the "use client" boundary.

export const themeDetectorScript = (function () {
  function themeFn() {
    const isValidTheme = (
      theme: string,
    ): theme is "light" | "dark" | "auto" => {
      return ["light", "dark", "auto"].includes(theme);
    };

    const storedTheme = localStorage.getItem("theme-mode") ?? "dark";
    const validTheme = isValidTheme(storedTheme) ? storedTheme : "dark";

    if (validTheme === "auto") {
      const autoTheme = window.matchMedia("(prefers-color-scheme: dark)").matches
        ? "dark"
        : "light";
      document.documentElement.setAttribute("data-theme", autoTheme);
    } else {
      document.documentElement.setAttribute("data-theme", validTheme);
    }
  }
  return `(${themeFn.toString()})();`;
})();
