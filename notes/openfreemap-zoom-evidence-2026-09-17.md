# دليل مصدر البلاطات عند الزوم العالي — 2026-09-17

المصادر المفحوصة من الصفحة المنشورة:

- Style: https://tiles.openfreemap.org/styles/liberty
- TileJSON: https://tiles.openfreemap.org/planet

تعريف Liberty يعرض المصدر `openmaptiles` كـ vector مع `url: https://tiles.openfreemap.org/planet`.

TileJSON يعيد:

- `maxzoom: 14`
- `minzoom: 0`
- PBF template: `https://tiles.openfreemap.org/planet/20260913_164504_pt/{z}/{x}/{y}.pbf`

في الصفحة المنشورة، سجل موارد الأداء أظهر style وTileJSON وsprites وglyphs، لكنه لم يظهر طلبات PBF في لقطة الفحص. هذا يعني أن سبب الأبيض يجب التحقق منه في حقن المصدر قبل MapLibre أو في طلبات PBF عند تغيير zoom، وليس بمجرد رفع maxZoom للكاميرا.
