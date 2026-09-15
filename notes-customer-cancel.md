# تشخيص وإصلاح إلغاء طلب العميل

## مصدر المشكلة

مشروع Supabase: `xgmmpcyroxldhjxzywof`.

رسالة جهاز العميل كانت: `Could not find the function public.cancel_order_by_customer(p_order_id) in the schema cache`.

فحص `pg_proc` قبل الإصلاح أعاد قائمة فارغة للدالتين `cancel_order_by_customer` و`create_order` بالاسم المطلوب، كما أن قائمة migrations في المشروع لم تكن تحتوي migration إلغاء العميل. enum `order_status` في قاعدة البيانات الإنتاجية يحتوي: `requested`, `accepted`, `arriving`, `awaiting_otp`, `delivered`, `cancelled`، ولا يحتوي `started`.

## الإصلاح المطبق

تم تطبيق migration `jarbou3_customer_cancel_before_start_fix` لإنشاء:

`public.cancel_order_by_customer(p_order_id uuid) returns public.orders`

الدالة `security definer`، تضبط `search_path = public`، وتلغي فقط إذا كان `customer_id = auth.uid()` وكانت الحالة واحدة من `requested`, `accepted`, `arriving`, `awaiting_otp`. عند محاولة حالة started مستقبلاً، تُقارن `status::text` وتعيد `CANNOT_CANCEL_STARTED_TRIP` دون الاعتماد على enum غير موجود حالياً، وإلا تعيد `ORDER_NOT_CANCELLABLE`.

تم تطبيق migration `jarbou3_customer_cancel_rpc_permissions_fix` لسحب EXECUTE من `anon` و`public` ومنحه إلى `authenticated` فقط.

## تحقق قاعدة البيانات

التحقق read-only أعاد:

`function_name = cancel_order_by_customer(uuid)`، `authenticated_execute = true`، `anon_execute = false`.

## المصدر المحلي

الدالة موثقة في `supabase/migrations/20260908_customer_cancel_before_start.sql`، والاستدعاء في `server/routers.ts` عبر `asUser(input.accessToken).rpc("cancel_order_by_customer", { p_order_id: input.orderId })`، والواجهة تنظف active trip وتعود إلى Home عند النجاح.

## رابط APK المتحقق

`https://files.manuscdn.com/user_upload_by_module/session_file/310519663276229936/dkWlXfkGrlFpLiyS.apk`

الحجم: `73,687,945` بايت. SHA-256: `e0b33fc4251ec405ac02805857077bb192495904093d9b7a1cc07a505ae884bb`.

تم التحقق من CDN عبر HTTP 206 و`Content-Range: bytes 0-0/73687945`.

## فحص الأمان بعد الترحيل

أداة Supabase الأمنية أظهرت تحذيرات عامة موجودة في المشروع، منها `pg_net` داخل `public` وتعطيل leaked-password protection، إضافة إلى مجموعة دوال `SECURITY DEFINER` مقصودة للتطبيق. ظهر RPC الجديد ضمن التحذير لأنه قابل للتنفيذ للمستخدم المصادق عليه، لكن هذا مقصود هنا لأن الخادم يستدعيه عبر access token، والدالة نفسها تتحقق من `customer_id = auth.uid()` وحالات الإلغاء. تم التحقق بشكل منفصل أن `anon_execute = false` و`authenticated_execute = true`.
