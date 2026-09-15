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

## تشخيص فشل تحميل الخريطة

في 2026-09-15 اختُبرت صفحة MapLibre مع نفس `https://tiles.openfreemap.org/styles/liberty` في Chromium. ظهرت canvas وأزرار التكبير والإسناد، لكن بقيت الخريطة بلون الخلفية ولم تصل حالة `load`؛ وهذا يطابق صورة بوابة الإدارة. فحص HTTP أثبت أن style والـsprite والـglyphs ومسار planet النسخي تستجيب 200 مع CORS. لذلك يلزم التقاط خطأ MapLibre الفعلي وعدم تحويل أي خطأ مورد فرعي إلى overlay دائم، مع اعتماد مسار tileset النسخي الصحيح إن كان style يعيد مساراً قديماً.

اختبار Chromium أكد أن `map.isStyleLoaded()` أعاد حالة التحميل، لكن `canvas.getContext('webgl')` غير متاح؛ لذلك كانت خريطة MapLibre فارغة رغم ظهور controls. أضيف fallback Leaflet تفاعلي محلي عند غياب WebGL أو فشل MapLibre، مع GPS وعلامات ومسارات وتحديث حي.

بعد إضافة fallback إلى smoke test بقيت الحالة `جارٍ التحميل` ولم تظهر خريطة Leaflet؛ لا توجد أخطاء console ظاهرة. هذا يشير إلى أن صفحة الاختبار لا تصل إلى فرع fallback أو أن أصول Leaflet المحلية لا تُخدم في smoke server، وسأتحقق من وجود `window.L` قبل تعديل بوابة الإدارة نهائياً.

بعد تعديل فحص WebGL ليستخدم canvas مباشرة، نجح smoke test في Chromium: ظهرت خريطة حماة فعلياً، وعناوين OpenFreeMap/OpenMapTiles/OpenStreetMap، وأصبح مسار تحميل الخريطة صالحاً. الخلل كان أن نسخة MapLibre المحلية لا تملك `maplibregl.supported`، فكان غياب الدالة يُفسّر خطأً كدعم WebGL؛ تم تصحيح ذلك وتفعيل fallback عند غياب WebGL.
