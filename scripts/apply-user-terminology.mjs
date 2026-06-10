#!/usr/bin/env node
/**
 * Replace role-based "Patient/Hasta" UI strings with "User/Kullanıcı".
 * Skips medical "hastalık/disease" lines. Does not rename i18n keys or API identifiers.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function isMedicalDiseaseValue(value) {
  return (
    /hastalı[kğı]|Hastalı[kğı]|Kronik [Hh]astalık|CHRONIC_DISEASE|heart_disease|kidney_disease|liver_disease|immune_system|condition\.(heart|asthma|kidney|liver|thyroid)/i.test(
      value,
    ) || /Kalp Hastalığı|Solunum Hastalığı|Böbrek Hastalığı|Karaciğer Hastalığı|Tiroid Hastalığı|Bağışıklık Sistemi Hastalığı/i.test(value)
  );
}

const TR_REPLACEMENTS = [
  ["Hasta Girişine Geç", "Kullanıcı Girişine Geç"],
  ["Hasta bağlamını gizle", "Kullanıcı bağlamını gizle"],
  ["Hasta bağlamı", "Kullanıcı bağlamı"],
  ["Hasta kimliği eksik", "Kullanıcı kimliği eksik"],
  ["Hasta kimliği bulunamadı", "Kullanıcı kimliği bulunamadı"],
  ["Hasta Olarak Kayıt Ol", "Kullanıcı Olarak Kayıt Ol"],
  ["Hasta olarak mı", "Kullanıcı olarak mı"],
  ["Hasta Girişi", "Kullanıcı Girişi"],
  ["Hasta Kaydı", "Kullanıcı Kaydı"],
  ["Hasta Kayıt", "Kullanıcı Kayıt"],
  ["Tedavi Öncesi Hasta Formu", "Tedavi Öncesi Form"],
  ["Onaylı Hasta", "Onaylı Kullanıcı"],
  ["Patient ID", "Kullanıcı ID"],
  ["Hasta ID", "Kullanıcı ID"],
  ["Son Hastalar", "Son Kullanıcılar"],
  ["Kayıtlı Hastalar", "Kayıtlı Kullanıcılar"],
  ["Hasta Limiti", "Kullanıcı Limiti"],
  ["Hastalar sayfasını", "Kullanıcılar sayfasını"],
  ["Hastalar listesini", "Kullanıcılar listesini"],
  ["Hastalar bölümünden", "Kullanıcılar bölümünden"],
  ["Hastalar →", "Kullanıcılar →"],
  ["Hastalar listesini", "Kullanıcılar listesini"],
  ["Hasta Talebi", "Kullanıcı Talebi"],
  ["Hasta mesajı", "Kullanıcı mesajı"],
  ["Hasta mesajlarında", "Kullanıcı mesajlarında"],
  ["Hasta sohbetini", "Kullanıcı sohbetini"],
  ["Hasta dolduruyor", "Kullanıcı dolduruyor"],
  ["Hasta kaydı", "Kullanıcı kaydı"],
  ["Bu hasta", "Bu kullanıcı"],
  ["bu hasta", "bu kullanıcı"],
  ["Son hasta", "Son kullanıcı"],
  ["son hasta", "son kullanıcı"],
  ["Henüz hasta", "Henüz kullanıcı"],
  ["henüz hasta", "henüz kullanıcı"],
  ["aktif hasta", "aktif kullanıcı"],
  ["Aktif Hasta", "Aktif Kullanıcı"],
  ["Hasta ekle", "Kullanıcı ekle"],
  ["hasta ekle", "kullanıcı ekle"],
  ["Yeni hasta", "Yeni kullanıcı"],
  ["yeni hasta", "yeni kullanıcı"],
  ["Seçili Hasta", "Seçili Kullanıcı"],
  ["Davet edilen hastalar", "Davet edilen kullanıcılar"],
  ["uluslararası hasta", "uluslararası kullanıcı"],
  ["Uluslararası Hasta", "Uluslararası Kullanıcı"],
  ["Yerel hasta", "Yerel kullanıcı"],
  ["Kızgın hasta", "Kızgın kullanıcı"],
  ["Hastaya görünür", "Kullanıcıya görünür"],
  ["Hastaya gidecek", "Kullanıcıya gidecek"],
  ["Hastaya giden", "Kullanıcıya giden"],
  ["Hastaya birebir", "Kullanıcıya birebir"],
  ["Hastaya gönder", "Kullanıcıya gönder"],
  ["Hastaya mesaj", "Kullanıcıya mesaj"],
  ["Hastayı", "Kullanıcıyı"],
  ["hastayı", "kullanıcıyı"],
  ["Hasta ·", "Kullanıcı ·"],
  ["Hasta bulunamadı", "Kullanıcı bulunamadı"],
  ["hasta bulunamadı", "kullanıcı bulunamadı"],
  ["hastanız", "kullanıcınız"],
  ["Hastalarınızı", "Kullanıcılarınızı"],
  ["Hasta hesabı", "Kullanıcı hesabı"],
  ["hasta hesabı", "kullanıcı hesabı"],
  ["Hasta hesapları", "Kullanıcı hesapları"],
  ["Hastalar", "Kullanıcılar"],
  ["hastalar", "kullanıcılar"],
  ["Hastanın", "Kullanıcının"],
  ["hastanın", "kullanıcının"],
  ["Hastaya", "Kullanıcıya"],
  ["hastaya", "kullanıcıya"],
  ["Hastaları", "Kullanıcıları"],
  ["Hasta veya", "Kullanıcı veya"],
  ["Hasta harici", "Kullanıcı harici"],
  ["Hasta dışı", "Kullanıcı dışı"],
  ["Hasta taslağı", "Kullanıcı taslağı"],
  ["Hasta ", "Kullanıcı "],
  [" hasta", " kullanıcı"],
  ['"Hasta"', '"Kullanıcı"'],
  ["hasta kimliği", "kullanıcı kimliği"],
  ["Bu hasta henüz", "Bu kullanıcı henüz"],
  ["Hastaya giden", "Kullanıcıya giden"],
  ["AI hastayla", "AI kullanıcıyla"],
  ["hastaya gider", "kullanıcıya gider"],
  ["hasta taslağı", "kullanıcı taslağı"],
  ["Hastaya gönder", "Kullanıcıya gönder"],
  ["Clinifly hasta", "Clinifly kullanıcı"],
  ["hasta kaydına", "kullanıcı kaydına"],
  ["hasta kaydınız", "kullanıcı kaydınız"],
  ["hasta limiti", "kullanıcı limiti"],
  ["Hasta yönetimi", "Kullanıcı yönetimi"],
  ["Hasta Mesaj", "Kullanıcı Mesaj"],
  ["Hasta Konuşma", "Kullanıcı Konuşma"],
  ["Hasta Daveti", "Kullanıcı Daveti"],
  ["Hasta Ekleyin", "Kullanıcı Ekleyin"],
  ["Hasta bilgisi", "Kullanıcı bilgisi"],
  ["Hasta Detay", "Kullanıcı Detay"],
  ["Hasta seç", "Kullanıcı seç"],
  ["hasta seç", "kullanıcı seç"],
  ["Hasta ara", "Kullanıcı ara"],
  ["Hasta Profil", "Profil"],
  ["My Patient Profile", "My Profile"],
  ["Patient Dashboard", "User Dashboard"],
  ["Hasta Panel", "Kullanıcı Paneli"],
  ["Hasta Mesajları", "Kullanıcı Mesajları"],
  ["Hasta Sohbet", "Kullanıcı Sohbet"],
];

const EN_REPLACEMENTS = [
  ["Switch to Patient Login", "Switch to User Login"],
  ["Patient Login", "User Login"],
  ["Patient Registration", "User Registration"],
  ["Register as Patient", "Register as User"],
  ["Registering as a patient", "Registering as a user"],
  ["Approved Patient", "Approved User"],
  ["Pre-Treatment Patient Form", "Pre-Treatment Form"],
  ["Patient context", "User context"],
  ["Patient ·", "User ·"],
  ["Last patient", "Last user"],
  ["Patient message", "User message"],
  ["Patient Request", "User Request"],
  ["Patient fills", "User fills"],
  ["Patient not found", "User not found"],
  ["Patient has registered", "User has registered"],
  ["This patient", "This user"],
  ["this patient", "this user"],
  ["Missing patient", "Missing user"],
  ["patient id", "user id"],
  ["Patient id", "User id"],
  ["Patient ID", "User ID"],
  ["Recent Patients", "Recent Users"],
  ["Invite Patients", "Invite Users"],
  ["Active patients", "Active users"],
  ["Pending patients", "Pending users"],
  ["Total patients", "Total users"],
  ["No active patients", "No active users"],
  ["No patients yet", "No users yet"],
  ["No recent patients", "No recent users"],
  ["No patients found", "No users found"],
  ["assigned patients", "assigned users"],
  ["international patients", "international users"],
  ["Add Patient", "Add User"],
  ["Add New Patient", "Add New User"],
  ["Patient detail", "User detail"],
  ["Patient Management", "User Management"],
  ["Patients section", "Users section"],
  ["Patients →", "Users →"],
  ["Patients list", "Users list"],
  ["Patients", "Users"],
  ["patients", "users"],
  ["Patient", "User"],
  ["patient", "user"],
];

const KA_REPLACEMENTS = [
  ["პაციენტის", "მომხმარებლის"],
  ["პაციენტები", "მომხმარებლები"],
  ["პაციენტ", "მომხმარებელი"],
];

const RU_REPLACEMENTS = [
  ["Пациенты", "Пользователи"],
  ["пациенты", "пользователи"],
  ["Пациент", "Пользователь"],
  ["пациент", "пользователь"],
];

function applyReplacements(value, pairs) {
  let out = value;
  for (const [from, to] of pairs) {
    out = out.split(from).join(to);
  }
  return out;
}

function transformTranslationLine(line) {
  const m = line.match(/^(\s+"[^"]+":\s+")(.*)("(?:,)?\s*)$/);
  if (!m) return line;
  const [, prefix, value, suffix] = m;
  if (isMedicalDiseaseValue(value)) return line;

  let next = value;
  next = applyReplacements(next, TR_REPLACEMENTS);
  next = applyReplacements(next, EN_REPLACEMENTS);
  next = applyReplacements(next, KA_REPLACEMENTS);
  next = applyReplacements(next, RU_REPLACEMENTS);

  if (next === value) return line;
  return `${prefix}${next}${suffix}`;
}

/** admin-i18n.js uses `key: "value"` without quoted keys in many places */
function transformAdminI18nLine(line) {
  const m = line.match(/^(\s+[A-Za-z0-9_.]+:\s+")(.*)("(?:,)?\s*)$/);
  if (!m) return line;
  const [, prefix, value, suffix] = m;
  if (isMedicalDiseaseValue(value)) return line;
  if (/patientId|patient_id|\/admin-patient/i.test(line)) return line;

  let next = value;
  next = applyReplacements(next, TR_REPLACEMENTS);
  next = applyReplacements(next, EN_REPLACEMENTS);
  next = applyReplacements(next, KA_REPLACEMENTS);
  next = applyReplacements(next, RU_REPLACEMENTS);

  if (next === value) return line;
  return `${prefix}${next}${suffix}`;
}

function transformFileContent(raw, lineTransformer) {
  const lines = raw.split("\n");
  let changed = 0;
  const out = lines.map((line) => {
    const next = lineTransformer(line);
    if (next !== line) changed++;
    return next;
  });
  return { changed, text: out.join("\n") };
}

const targets = [
  {
    file: path.join(__dirname, "../lib/i18n.ts"),
    transform: transformTranslationLine,
  },
  {
    file: path.join(__dirname, "../../cliniflow-backend-clean/public/admin-i18n.js"),
    transform: transformAdminI18nLine,
  },
];

for (const { file, transform } of targets) {
  if (!fs.existsSync(file)) {
    console.warn("skip missing", file);
    continue;
  }
  const raw = fs.readFileSync(file, "utf8");
  const { changed, text } = transformFileContent(raw, transform);
  if (changed > 0) fs.writeFileSync(file, text, "utf8");
  console.log(`${path.basename(file)}: ${changed} lines updated`);
}
