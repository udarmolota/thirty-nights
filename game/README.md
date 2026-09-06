# 30 Nights

Mobile survival-strategy with a finite arc: 14 days of shrinking daylight to
fortify an arctic mining compound, then 30 nights of siege. Design documents
live in `../design/` (GDD in Russian, art brief, balance model).

Stack: TypeScript strict + Vite + Canvas 2D + Capacitor (Android, landscape).
The foundation (grid, A*, rooms, camera, touch input, loop, rng, i18n) is
carried over from Last Ember; all gameplay is new.

    npm install
    npm run dev      # browser
    npm test         # vitest
    npm run build    # tsc --noEmit && vite build
