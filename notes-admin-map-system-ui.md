# توحيد خرائط الإدارة وواجهة النظام

## مرجع خارجي

توثيق Expo SDK 54 الرسمي: https://docs.expo.dev/versions/v54.0.0/sdk/navigation-bar/

القيم المعتمدة من التوثيق: `NavigationBar.setVisibilityAsync("hidden")` لإخفاء شريط Android، و`NavigationBar.setBehaviorAsync("overlay-swipe")` لإظهاره مؤقتاً عند السحب من أسفل/أعلى الشاشة. إعداد plugin يدعم `visibility: "hidden"`, `behavior: "overlay-swipe"`, و`position: "absolute"`.

## عقد الخريطة الحالي في التطبيق

مصدر MapLibre Native هو Liberty style: `https://tiles.openfreemap.org/styles/liberty`، مع حدود حماة، zoom 11–19، UserLocation، علامات المصدر/الوجهة/السائق، ومسار GeoJSON.

## خطة الإدارة

خريطة الأسطول وخريطة أماكن OPTIMUS X ستستخدم MapLibre GL JS محلياً من `admin-site/vendor/maplibre/` مع نفس Liberty style، GeoJSON route layer، علامات DOM للعملاء والسائقين والأماكن، وGeolocateControl عالي الدقة. سيتم تحديث العلامات عبر `setLngLat` وبيانات المسار عبر `setData` دون إعادة إنشاء Map instance في كل تحديث. إزالة Leaflet ومصدر `tile.openstreetmap.org` من سطح الإدارة.

## تحقق بصري

في 2026-09-15 تم فتح `/admin/` عبر خدمة المشروع المؤقتة. صفحة الدخول حملت بنجاح بعنوان `OPTIMUS X | بوابة الإدارة`، وظهرت حقول كلمة المرور وزر فتح الموقع دون أخطاء بنيوية. الخرائط محمية خلف تسجيل دخول المدير، لذلك لم يتم تنفيذ عملية دخول أو إدخال كلمة مرور غير مقدمة من المستخدم.
