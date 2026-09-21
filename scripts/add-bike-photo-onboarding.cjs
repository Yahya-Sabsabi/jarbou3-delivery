const fs = require('fs');
const root = '/home/ubuntu/jarbou3-delivery';
const routerPath = `${root}/server/routers.ts`;
const appPath = `${root}/components/jarbou3-app.tsx`;

let router = fs.readFileSync(routerPath, 'utf8');
router = router.replace(
  'vehicleType: z.enum(["motorcycle", "electric_scooter"]).optional(), personalPhoto: imageInput.optional(), identityPhoto: imageInput.optional() }',
  'vehicleType: z.enum(["motorcycle", "electric_scooter"]).optional(), personalPhoto: imageInput.optional(), identityPhoto: imageInput.optional(), vehiclePhoto: imageInput.optional() }'
);
router = router.replace(
  'if (input.requestedRole === "driver" && !isPreapprovedTeamDriver && (!input.personalPhoto || !input.identityPhoto)) throw new Error("DRIVER_DOCUMENTS_REQUIRED");',
  'if (input.requestedRole === "driver" && !isPreapprovedTeamDriver && (!input.personalPhoto || !input.identityPhoto || !input.vehiclePhoto)) throw new Error("DRIVER_DOCUMENTS_REQUIRED");'
);
router = router.replace(
  'select("id,full_name,status,requested_role,code_expires_at,retry_after,personal_photo_path,identity_photo_path")',
  'select("id,full_name,status,requested_role,code_expires_at,retry_after,personal_photo_path,identity_photo_path,vehicle_photo_path")'
);
router = router.replace(
  'input.requestedRole === "driver" && input.personalPhoto && input.identityPhoto && (!existing.personal_photo_path || !existing.identity_photo_path)',
  'input.requestedRole === "driver" && input.personalPhoto && input.identityPhoto && input.vehiclePhoto && (!existing.personal_photo_path || !existing.identity_photo_path || !existing.vehicle_photo_path)'
);
router = router.replace(
  'const identity = decodeSmallPrivateImage(input.identityPhoto);\n            const prefix = `onboarding-documents/${existing.id}`;\n            const personalPath = `${prefix}/personal-${Date.now()}.${personal.contentType.endsWith("png") ? "png" : "jpg"}`;\n            const identityPath = `${prefix}/identity-${Date.now()}.${identity.contentType.endsWith("png") ? "png" : "jpg"}`;\n            const [personalUpload, identityUpload] = await Promise.all([\n              service.storage.from("jarbou3-private").upload(personalPath, personal.buffer, { contentType: personal.contentType, upsert: false }),\n              service.storage.from("jarbou3-private").upload(identityPath, identity.buffer, { contentType: identity.contentType, upsert: false }),\n            ]);\n            if (personalUpload.error || identityUpload.error) throw new Error(personalUpload.error?.message ?? identityUpload.error?.message ?? "DOCUMENT_UPLOAD_FAILED");\n            const { error: documentUpdateError } = await service.from("account_verification_requests").update({ personal_photo_path: personalPath, identity_photo_path: identityPath }).eq("id", existing.id);',
  'const identity = decodeSmallPrivateImage(input.identityPhoto);\n            const vehicle = decodeSmallPrivateImage(input.vehiclePhoto);\n            const prefix = `onboarding-documents/${existing.id}`;\n            const timestamp = Date.now();\n            const personalPath = `${prefix}/personal-${timestamp}.${personal.contentType.endsWith("png") ? "png" : "jpg"}`;\n            const identityPath = `${prefix}/identity-${timestamp}.${identity.contentType.endsWith("png") ? "png" : "jpg"}`;\n            const vehiclePath = `${prefix}/vehicle-${timestamp}.${vehicle.contentType.endsWith("png") ? "png" : "jpg"}`;\n            const [personalUpload, identityUpload, vehicleUpload] = await Promise.all([\n              service.storage.from("jarbou3-private").upload(personalPath, personal.buffer, { contentType: personal.contentType, upsert: false }),\n              service.storage.from("jarbou3-private").upload(identityPath, identity.buffer, { contentType: identity.contentType, upsert: false }),\n              service.storage.from("jarbou3-private").upload(vehiclePath, vehicle.buffer, { contentType: vehicle.contentType, upsert: false }),\n            ]);\n            if (personalUpload.error || identityUpload.error || vehicleUpload.error) throw new Error(personalUpload.error?.message ?? identityUpload.error?.message ?? vehicleUpload.error?.message ?? "DOCUMENT_UPLOAD_FAILED");\n            const { error: documentUpdateError } = await service.from("account_verification_requests").update({ personal_photo_path: personalPath, identity_photo_path: identityPath, vehicle_photo_path: vehiclePath }).eq("id", existing.id);'
);
router = router.replace(
  'requested_role: input.requestedRole, vehicle_type: input.requestedRole === "driver" ? input.vehicleType : null, preapproved_by_admin',
  'requested_role: input.requestedRole, vehicle_type: input.requestedRole === "driver" ? input.vehicleType : null, preapproved_by_admin'
);
router = router.replace(
  'if (input.requestedRole === "driver" && input.personalPhoto && input.identityPhoto) {\n          const personal = decodeSmallPrivateImage(input.personalPhoto);\n          const identity = decodeSmallPrivateImage(input.identityPhoto);\n          const prefix = `onboarding-documents/${data.id}`;\n          const personalPath = `${prefix}/personal-${Date.now()}.${personal.contentType.endsWith("png") ? "png" : "jpg"}`;\n          const identityPath = `${prefix}/identity-${Date.now()}.${identity.contentType.endsWith("png") ? "png" : "jpg"}`;\n          const [personalUpload, identityUpload] = await Promise.all([\n            service.storage.from("jarbou3-private").upload(personalPath, personal.buffer, { contentType: personal.contentType, upsert: false }),\n            service.storage.from("jarbou3-private").upload(identityPath, identity.buffer, { contentType: identity.contentType, upsert: false }),\n          ]);\n          if (personalUpload.error || identityUpload.error) throw new Error(personalUpload.error?.message ?? identityUpload.error?.message ?? "DOCUMENT_UPLOAD_FAILED");\n          const { error: documentUpdateError } = await service.from("account_verification_requests").update({ personal_photo_path: personalPath, identity_photo_path: identityPath }).eq("id", data.id);',
  'if (input.requestedRole === "driver" && input.personalPhoto && input.identityPhoto && input.vehiclePhoto) {\n          const personal = decodeSmallPrivateImage(input.personalPhoto);\n          const identity = decodeSmallPrivateImage(input.identityPhoto);\n          const vehicle = decodeSmallPrivateImage(input.vehiclePhoto);\n          const prefix = `onboarding-documents/${data.id}`;\n          const timestamp = Date.now();\n          const personalPath = `${prefix}/personal-${timestamp}.${personal.contentType.endsWith("png") ? "png" : "jpg"}`;\n          const identityPath = `${prefix}/identity-${timestamp}.${identity.contentType.endsWith("png") ? "png" : "jpg"}`;\n          const vehiclePath = `${prefix}/vehicle-${timestamp}.${vehicle.contentType.endsWith("png") ? "png" : "jpg"}`;\n          const [personalUpload, identityUpload, vehicleUpload] = await Promise.all([\n            service.storage.from("jarbou3-private").upload(personalPath, personal.buffer, { contentType: personal.contentType, upsert: false }),\n            service.storage.from("jarbou3-private").upload(identityPath, identity.buffer, { contentType: identity.contentType, upsert: false }),\n            service.storage.from("jarbou3-private").upload(vehiclePath, vehicle.buffer, { contentType: vehicle.contentType, upsert: false }),\n          ]);\n          if (personalUpload.error || identityUpload.error || vehicleUpload.error) throw new Error(personalUpload.error?.message ?? identityUpload.error?.message ?? vehicleUpload.error?.message ?? "DOCUMENT_UPLOAD_FAILED");\n          const { error: documentUpdateError } = await service.from("account_verification_requests").update({ personal_photo_path: personalPath, identity_photo_path: identityPath, vehicle_photo_path: vehiclePath }).eq("id", data.id);'
);
router = router.replace(
  '.select("id,full_name,requested_role,vehicle_type,personal_photo_path,identity_photo_path")',
  '.select("id,full_name,requested_role,vehicle_type,personal_photo_path,identity_photo_path,vehicle_photo_path")'
);
router = router.replace(
  'if (!request.personal_photo_path || !request.identity_photo_path) throw new Error("DRIVER_DOCUMENTS_REQUIRED");',
  'if (!request.personal_photo_path || !request.identity_photo_path || !request.vehicle_photo_path) throw new Error("DRIVER_DOCUMENTS_REQUIRED");'
);
router = router.replace(
  'personal_photo_path: request.personal_photo_path, id_photo_path: request.identity_photo_path, status:',
  'personal_photo_path: request.personal_photo_path, id_photo_path: request.identity_photo_path, vehicle_photo_path: request.vehicle_photo_path, status:'
);
fs.writeFileSync(routerPath, router);

let app = fs.readFileSync(appPath, 'utf8');
app = app.replace(
  'const [onboardingIdentityPhoto, setOnboardingIdentityPhoto] = useState<string | null>(null);',
  'const [onboardingIdentityPhoto, setOnboardingIdentityPhoto] = useState<string | null>(null);\n  const [onboardingVehiclePhoto, setOnboardingVehiclePhoto] = useState<string | null>(null);'
);
app = app.replace(
  '(!onboardingPersonalPhoto || !onboardingIdentityPhoto)',
  '(!onboardingPersonalPhoto || !onboardingIdentityPhoto || !onboardingVehiclePhoto)'
);
app = app.replace(
  '"التقط الصورة الشخصية وصورة الهوية قبل إرسال طلب المراجعة."',
  '"التقط الصورة الشخصية وصورة الهوية وصورة الدراجة النارية قبل إرسال طلب المراجعة."'
);
app = app.replace(
  'identityPhoto: role === "driver" && !isMatchingTeamDriver ? onboardingIdentityPhoto ?? undefined : undefined })',
  'identityPhoto: role === "driver" && !isMatchingTeamDriver ? onboardingIdentityPhoto ?? undefined : undefined, vehiclePhoto: role === "driver" && !isMatchingTeamDriver ? onboardingVehiclePhoto ?? undefined : undefined })'
);
app = app.replace(
  'const captureOnboardingDocument = async (kind: "personal" | "identity") => {',
  'const captureOnboardingDocument = async (kind: "personal" | "identity" | "vehicle") => {'
);
app = app.replace(
  'if (kind === "personal") setOnboardingPersonalPhoto(uri); else setOnboardingIdentityPhoto(uri);',
  'if (kind === "personal") setOnboardingPersonalPhoto(uri); else if (kind === "identity") setOnboardingIdentityPhoto(uri); else setOnboardingVehiclePhoto(uri);'
);
app = app.replace(
  '<AuthDocumentCard icon="badge" title="صورة الهوية" detail="إضافة صورة الهوية بوضوح" uri={onboardingIdentityPhoto} onPress={() => captureOnboardingDocument("identity")} />',
  '<AuthDocumentCard icon="badge" title="صورة الهوية" detail="إضافة صورة الهوية بوضوح" uri={onboardingIdentityPhoto} onPress={() => captureOnboardingDocument("identity")} /><AuthDocumentCard icon="two-wheeler" title="صورة الدراجة النارية" detail="إضافة صورة واضحة للدراجة" uri={onboardingVehiclePhoto} onPress={() => captureOnboardingDocument("vehicle")} />'
);
app = app.replace(
  'أرفق الصورة الشخصية وصورة الهوية قبل الإرسال.',
  'أرفق الصورة الشخصية وصورة الهوية وصورة الدراجة النارية قبل الإرسال.'
);
fs.writeFileSync(appPath, app);

console.log('Updated onboarding backend and driver registration UI for vehicle photo.');
