# CSS to Tailwind Converter

Automatically convert CSS stylesheets to Tailwind utility classes while preserving responsive design across all breakpoints. Uses Playwright and Chrome DevTools Protocol to extract browser-rendered styles and translate them to Tailwind.

> **⚠️ Alpha Version** - Still in development. Testing and improvements needed.

## Quick Start

```bash
# Install
npm install

# Place files in test/input/
# - index.html
# - style.css

# Convert
npm run convert

# Output: test/output/tailwind.html
```

## Key Features

- **Browser-accurate extraction** - Captures actual rendered styles at each breakpoint
- **Responsive support** - Handles all Tailwind breakpoints (sm, md, lg, xl, 2xl)
- **Value preservation** - Maintains original CSS values (`10vw`, `calc()`, etc.)
- **Complete coverage** - Expands shorthand properties for thorough conversion

## How It Works

1. **Validate** - Checks media queries match Tailwind breakpoints
2. **Process** - Adds element IDs, cleans CSS, expands shorthands
3. **Extract** - Captures styles at each breakpoint with/without CSS enabled
4. **Convert** - Translates properties to Tailwind classes with responsive prefixes

## Breakpoints

| Breakpoint | Prefix | Min Width |
|------------|--------|-----------|
| Default    | -      | -         |
| sm         | sm:    | 640px     |
| md         | md:    | 768px     |
| lg         | lg:    | 1024px    |
| xl         | xl:    | 1280px    |
| 2xl        | 2xl:   | 1536px    |

## Limitations

- Tailwind standard breakpoints only
- Complex selectors (`:nth-child`, `:hover`) need manual adjustment
- Animations and transitions require manual conversion
- Custom CSS properties may not have Tailwind equivalents

## Debugging

Check `logs/` directory for timestamped debug logs. Intermediate files in `test/output/json/` show processing stages.

## License

MIT License

## Built With

[Playwright](https://playwright.dev/) • [clean-css](https://github.com/clean-css/clean-css) • [Tailwind CSS](https://tailwindcss.com/)