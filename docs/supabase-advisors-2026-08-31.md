# نتائج مستشاري Supabase — 2026-08-31

تم فحص المشروع `xgmmpcyroxldhjxzywof` بعد إضافة `vehicle_type` إلى `public.users`.

## الأمن

ظهر تحذير بقاء امتداد `pg_net` في مخطط `public`، ورابط المعالجة هو [Supabase database linter 0014](https://supabase.com/docs/guides/database/database-linter?lint=0014_extension_in_public).

ظهرت تحذيرات تنفيذ دوال `SECURITY DEFINER` من دور `authenticated` عبر RPC، وتشمل `accept_order` و`confirm_monthly_report_download` و`decline_order_offer` و`get_customer_order_trip_path` و`get_own_active_trip_metrics` و`get_own_company_balance` و`list_driver_order_offers` و`record_own_driver_live_location` و`verify_delivery_otp`. هذه الدوال مستعملة عمداً من الخادم بعد التحقق من JWT والدور، لذلك لا تُلغى صلاحية التنفيذ عشوائياً قبل نقل الاستدعاء إلى مسار خدمة مضبوط أو تحويل الدالة مع الحفاظ على RLS. رابط الإرشاد هو [Supabase database linter 0029](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable).

ظهر أيضاً تحذير تعطيل حماية كلمات المرور المتسربة. يمكن تفعيلها من إعدادات Auth وفق [Supabase password security](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).

## الأداء

ظهرت ملاحظات `INFO` عن مفاتيح خارجية بلا فهارس تغطية في جداول تشغيلية متعددة، وتحذيرات `auth_rls_initplan` لأن بعض سياسات RLS تعيد تقييم دوال `auth` لكل صف. رابط المعالجة العام هو [Supabase unindexed foreign keys](https://supabase.com/docs/guides/database/database-linter?lint=0001_unindexed_foreign_keys) و[Supabase RLS initialization plans](https://supabase.com/docs/guides/database/database-linter?lint=0003_auth_rls_initplan).

هذه النتائج لم تمنع تشغيل التطبيق، لكنها تمثل جولة تحسين مستقلة لاحقة. لا ينبغي تعديلها عشوائياً في الإنتاج قبل مراجعة كل سياسة واختبار مسارات العميل والسفير والإدارة.
